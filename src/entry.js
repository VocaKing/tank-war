// Editor does not initialize WebGL or run a battle. Both routes share the game origin.
if (new URLSearchParams(location.search).get('balance') === '1') import('./ui/balanceEditor.js');
else import('./main.js');
