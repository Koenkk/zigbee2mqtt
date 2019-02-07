# Flashing without re-pairing

## Why do I need to re-pair?
Flashing firmware usually requires re-pairing of all connected [routers](zigbee_network.md#Router).
If you remove the coordinator from the network, the remaining routers (e.g. bulbs) can still communicate with each other and they still form a zigbee network.
If you now flash the coordinator and try to bring it back to the network, it will use its old `pan_id` incremented by one. 
So if you used the default `pan_id: 0x1a62` your coordinator will now use `pan_id: 0x1a63`.
This will result in a new PAN (personal area network) with no connection to the old one.

This means that you have to follow the instructions on how to [pair a device](../getting_started/pairing_devices.md) again for every router that was connected to the coordinator.

## How to avoid re-pairing
You can try to avoid this by bringing your coordinator out of range from your other network devices. There are multiple options to achieve this:

* Shield the coordinator with tinfoil
* Take the coordinator physically out of range (e.g. drive to a nice place with your coordinator)
* Cut the power of all connected routers

Once you are outside the network range you can [flash the coordinator with the new firmware](../getting_started/flashing_the_cc2531.md) and start zigbee2mqtt. 
After zigbee2mqtt started successfully, you can shutdown zigbee2mqtt and bring the coordinator back in network range.

Your coordinator should now use the old `pan_id` and therefore be in the same PAN as before.
You need to set `permit_join: true` and wait a few minutes to let your devices reconnect. 