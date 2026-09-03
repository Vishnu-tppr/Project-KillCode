const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SOLUTIONS_DIR = path.join(__dirname, 'solutions');

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    // Expected: /solutions/<programId>.md
    const m = urlPath.match(/^\/solutions\/(\d+)\.md$/);
    if (!m) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found. Expected /solutions/<ProgramID>.md');
        return;
    }

    const file = path.join(SOLUTIONS_DIR, m[1] + '.md');
    if (!file.startsWith(SOLUTIONS_DIR) || !fs.existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('No solution found for ProgramID ' + m[1]);
        return;
    }

    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Read error');
            return;
        }
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`SkillRack solutions server running at http://localhost:${PORT}`);
    console.log(`  e.g. http://localhost:${PORT}/solutions/2571.md`);
});
