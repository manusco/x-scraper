import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgBuffer = fs.readFileSync(path.join('icons', 'icon.svg'));

[16, 48, 128].forEach(size => {
    sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join('icons', `icon${size}.png`))
        .then(info => {
            console.log(`Generated icon${size}.png`);
        })
        .catch(err => {
            console.error(`Error generating icon${size}.png:`, err);
        });
});
