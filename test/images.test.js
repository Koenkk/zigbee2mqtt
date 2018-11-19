const devices = require('zigbee-shepherd-converters').devices;
const chai = require('chai');
const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size');

const imageBase = path.join(__dirname, '..', 'images', 'devices');
const replaceByDash = [new RegExp('/', 'g'), new RegExp(':', 'g'), new RegExp(' ', 'g')];

describe('Device images', () => {
    it('All devices should have an image in jpg format', () => {
        const missing = [];

        devices.forEach((d) => {
            let image = d.model;
            replaceByDash.forEach((r) => image = image.replace(r, '-'));
            image = `${image}.jpg`;

            if (!fs.existsSync(path.join(imageBase, image))) {
                missing.push(image);
            }
        });

        chai.assert.strictEqual(missing.length, 0, `Missing device images: ${missing.join(', ')}`);
    });

    it('All device images should have a dimension of 150x150', () => {
        const invalid = [];

        fs.readdirSync(imageBase).forEach((file) => {
            if (!file.toLowerCase().endsWith('.jpg')) {
                return;
            }

            const dimensions = sizeOf(path.join(imageBase, file));

            if (dimensions.width != 150 || dimensions.height != 150) {
                invalid.push(file);
            }
        });

        chai.assert.strictEqual(invalid.length, 0, `Invalid device image dimensions: ${invalid.join(', ')}`);
    });
});
