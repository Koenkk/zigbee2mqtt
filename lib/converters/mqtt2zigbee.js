const converters = {
    "state": (value) => {
        return {
            cId: 'genOnOff',
            cmd: value.toLowerCase(),
            zclData: {},
        }
    },
    "brightness": (value) => {
        return {
            cId: 'genLevelCtrl',
            cmd: 'moveToLevel',
            zclData: {
                level: value,
                transtime: 0,
            },
        }
    },
    "color_temp": (value) => {
        return {
            cId: 'lightingColorCtrl',
            cmd: 'moveToColorTemp',
            zclData: {
                colortemp: value,
                transtime: 0,
            },
        }
    },
    "color": (value) => {
        return {
            cId: 'lightingColorCtrl',
            cmd: 'moveToColor',
            zclData: {
                colorx: value.x * 65535,
                colory: value.y * 65535,
                transtime: 0,
            },
        }
    },
}

module.exports = converters;