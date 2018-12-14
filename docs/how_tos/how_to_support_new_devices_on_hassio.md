# How to support new devices on Hass.io

1. Enable access to your Hass.io host following these instructions
https://developers.home-assistant.io/docs/en/hassio_debugging.html

2. Connect to your Hass.io host\
`ssh root@hassio.local -p 22222`\
`login`

3. Identify the container id of zigbee2mqtt\
`docker ps`\
look for IMAGE dwelch2101/zigbee2mqtt-armhf and its corresponding CONTAINER ID\
example:**622baa375aa1**

4. Enter the running container (replace the below container id with yours)\
`docker exec -it 622baa375aa1 bash`

5. You are now inside the zigbee2mqtt container and can follow the standard guide:\
[https://koenkk.github.io/zigbee2mqtt/how_tos/how_to_support_new_devices.html](https://koenkk.github.io/zigbee2mqtt/how_tos/how_to_support_new_devices.html)

6.  The VI editor is installed on the image, if you are not familiar with VI you may want take a look here:
 [https://www.guru99.com/the-vi-editor.html](https://www.guru99.com/the-vi-editor.html)

7. After making required modifications restart the container for the changes to take effect\
`exit`\
`docker restart 622baa375aa1`

Be aware that changes are not persistent, any changes that recreate the docker container HASSIO will result in the changes being lost so make sure you request modifications are provided back to the project for integration.

**Persisting a custom devices.js**

As of hass.io zigbee2mqtt add-on v0.1.8, there is an option for using a custom `devices.js`\
While the procedure above is very useful for adding / debugging support for devices, making the updates persistent is now possible with this new option. To use a custom `devices.js` by default, follow these steps:

1. Make sure you're using at least 0.1.8 version of zigbee2mqtt add-on.

2. Edit zigbee2mqtt's config in Hass.io GUI and add this option:\
`"zigbee_shepherd_devices": true`

3. Add custom `devices.js` to the config path of the add-on.\
This path is `/share/zigbee2mqtt` by default, and controlled with the `data_path` option in the config of the add-on.

4. Restart the add-on.

5. Check the logs of the add-on, it should include the following line:\
`[Info] Searching for custom devices file in zigbee2mqtt data path...`

If all goes well, your custom `devices.js` will be copied to the zigbee2mqtt container upon container startup, and it will be used by `zigbee-shepherd`.\
As the add-on config and the files on config path are permanent, this configuration will persist upon reboots and container updates.