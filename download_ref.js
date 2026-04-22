const fs = require('fs');
const https = require('https');
const path = require('path');

const targetPath = path.join(__dirname, 'backend', 'uploads', 'reference', 'reference.jpg');

// Ensure directory exists
fs.mkdirSync(path.dirname(targetPath), { recursive: true });

https.get('https://picsum.photos/400/300', (res) => {
    if (res.statusCode === 302 || res.statusCode === 301) {
        https.get(res.headers.location, (res2) => {
            const file = fs.createWriteStream(targetPath);
            res2.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log('Downloaded reference image.');
            });
        });
    } else {
        const file = fs.createWriteStream(targetPath);
        res.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log('Downloaded reference image.');
        });
    }
}).on('error', (err) => {
    console.error('Error downloading:', err.message);
});
