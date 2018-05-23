const converters = {
    onoff: {
        key: 'state',
        convert: (value) => {
            return {
                cid: 'genOnOff',
                cmd: value.toLowerCase(),
                zclData: {},
            };
        },
    },
    light_brightness: {
        key: 'brightness',
        convert: (value) => {
            return {
                cid: 'genLevelCtrl',
                cmd: 'moveToLevel',
                zclData: {
                    level: value,
                    transtime: 0,
                },
            };
        },
    },
    light_colortemp: {
        key: 'color_temp',
        convert: (value) => {
            return {
                cid: 'lightingColorCtrl',
                cmd: 'moveToColorTemp',
                zclData: {
                    colortemp: value,
                    transtime: 0,
                },
            };
        },
    },
    light_color: {
        key: 'color',
        convert: (value) => {
            return {
                cid: 'lightingColorCtrl',
                cmd: 'moveToColor',
                zclData: {
                    colorx: value.x * 65535,
                    colory: value.y * 65535,
                    transtime: 0,
                },
            };
        },
    },
};

module.exports = converters;
