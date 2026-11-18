# QA: shortest retainer paths from GC roots to the node(s) named QaLeakMarker in a V8 heap snapshot
import json, sys, collections
snap = json.load(open(sys.argv[1])); meta = snap['snapshot']['meta']
nf = meta['node_fields']; ef = meta['edge_fields']; NF, EF = len(nf), len(ef)
ntypes = meta['node_types'][0]; etypes = meta['edge_types'][0]; S = snap['strings']; N = snap['nodes']; E = snap['edges']
i_type, i_name, i_ec = nf.index('type'), nf.index('name'), nf.index('edge_count'); e_type, e_name, e_to = ef.index('type'), ef.index('name_or_index'), ef.index('to_node')
n = len(N) // NF; first = [0] * (n + 1)
for k in range(n): first[k + 1] = first[k] + N[k * NF + i_ec]
rev = collections.defaultdict(list)
for k in range(n):
    for e in range(first[k], first[k + 1]):
        b = e * EF; t = etypes[E[b + e_type]]
        if t == 'weak': continue
        to = E[b + e_to] // NF; nm = S[E[b + e_name]] if t in ('context', 'property', 'internal', 'shortcut') else str(E[b + e_name])
        rev[to].append((k, t, nm))
name = lambda k: S[N[k * NF + i_name]]; typ = lambda k: ntypes[N[k * NF + i_type]]
targets = [k for k in range(n) if name(k) == 'QaLeakMarker' and typ(k) == 'object']
print('markers', len(targets))
for tgt in targets[:2]:
    # BFS backwards to the root node (index 0)
    prev = {tgt: None}; q = collections.deque([tgt]); found = None
    while q:
        c = q.popleft()
        if c == 0: found = c; break
        for (p, t, nm) in rev[c]:
            if p not in prev: prev[p] = (c, t, nm); q.append(p)
    if found is None: print('unreachable (collectable)'); continue
    path = []; c = 0
    while prev[c] is not None: nxt, t, nm = prev[c]; path.append(f"{typ(c)}:{name(c)[:40]} --[{t}:{nm[:40]}]-->"); c = nxt
    print('\n'.join(path)); print('MARKER')
# identify the object holding .game on the path (its own property names)
if len(sys.argv) > 2:
    for k in range(n):
        if name(k) == sys.argv[2] and typ(k) == 'object':
            props = [S[E[e * EF + e_name]] for e in range(first[k], first[k + 1]) if etypes[E[e * EF + e_type]] == 'property']
            if 'game' in props: print(sys.argv[2], props[:40]); break
