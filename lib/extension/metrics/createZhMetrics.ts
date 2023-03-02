import meter, { type Registry as MetricsRegistry } from "prom-client"
import { Adapter } from "zigbee-herdsman/dist/adapter"
import { Events as AdapterEvents } from "zigbee-herdsman/dist/adapter/events"
import { Device, Entity } from "zigbee-herdsman/dist/controller/model"
import * as settings from '../../util/settings';

function perDeviceHelp(help: string, perDeviceHelp: string) {
  if (!settings.get().metrics.per_device_labels) {
    return help
  }
  return help + perDeviceHelp
}
function perDeviceLabels(labels: Record<string, unknown>, perDeviceLabels: Record<string, unknown>) {
  if (!settings.get().metrics.per_device_labels) {
    return labels
  }
  return { ...labels, ...perDeviceLabels }
}

class MetricsZHAdapter extends Entity {
  static use() {
    const originalAdapter = Entity.adapter
    const wrappedAdapter: Adapter = Object.create(originalAdapter)
    Entity.injectAdapter(wrappedAdapter)
    return { wrappedAdapter, originalAdapter }
  }
}

export function createZhMetrics() {
  const { wrappedAdapter, originalAdapter } = MetricsZHAdapter.use()

  const zigbee_herdsman_zcl_frame_tx = new meter.Counter({
    name: 'zigbee_herdsman_zcl_frame_tx',
    help: perDeviceHelp('Zigbee ZCL frames transmitted, labelled by destination', ' and destination address or group id if available'),
    labelNames: ['dest', 'destAddr', 'groupId']
  })
  wrappedAdapter.sendZclFrameToEndpoint = (...args) => {
    const destAddr = args[0]
    zigbee_herdsman_zcl_frame_tx.inc(perDeviceLabels({ dest: 'endpoint' }, { destAddr }), 1)
    return originalAdapter.sendZclFrameToEndpoint(...args)
  }
  wrappedAdapter.sendZclFrameToGroup = (...args) => {
    const groupId = args[0]
    zigbee_herdsman_zcl_frame_tx.inc(perDeviceLabels({ dest: 'group' }, { groupId }), 1)
    return originalAdapter.sendZclFrameToGroup(...args)
  }
  wrappedAdapter.sendZclFrameToAll = (...args) => {
    zigbee_herdsman_zcl_frame_tx.inc({ dest: 'all' })
    return originalAdapter.sendZclFrameToAll(...args)
  }
  wrappedAdapter.sendZclFrameInterPANToIeeeAddr = (...args) => {
    const destAddr = args[1]
    zigbee_herdsman_zcl_frame_tx.inc(perDeviceLabels({ dest: 'inter_pan_to_ieee_addr' }, { destAddr }))
    return originalAdapter.sendZclFrameInterPANToIeeeAddr(...args)
  }
  wrappedAdapter.sendZclFrameInterPANBroadcast = (...args) => {
    zigbee_herdsman_zcl_frame_tx.inc({ dest: 'inter_pan_broadcast' })
    return originalAdapter.sendZclFrameInterPANBroadcast(...args)
  }

  const zigbee_herdsman_zcl_frame_rx = new meter.Counter({
    name: 'zigbee_herdsman_zcl_frame_rx',
    help: perDeviceHelp('Zigbee ZCL frames received, labelled by type', ' and source ieee address'),
    labelNames: ['type', 'srcAddr']
  })

  const rxTypes = [
    AdapterEvents.deviceJoined,
    AdapterEvents.deviceAnnounce,
    AdapterEvents.deviceLeave,
    AdapterEvents.networkAddress,
    AdapterEvents.rawData,
    AdapterEvents.zclData
  ]
  rxTypes.forEach(type => {
    originalAdapter.on(type, (payload) => {
      let srcAddr
      switch (type) {
        case AdapterEvents.rawData:
        case AdapterEvents.zclData:
          srcAddr = Device.byNetworkAddress(payload.address).ieeeAddr
          break;
        case AdapterEvents.deviceJoined:
        case AdapterEvents.deviceAnnounce:
        case AdapterEvents.deviceLeave:
        case AdapterEvents.networkAddress:
          srcAddr = payload.ieeeAddr
          break
      }
      srcAddr = srcAddr ?? 'unknown'

      zigbee_herdsman_zcl_frame_rx.inc(perDeviceLabels({ type }, { srcAddr }), 1)
    })
  })

  const zigbee_herdsman_adapter_disconnected = new meter.Counter({
    name: 'zigbee_herdsman_adapter_disconnected',
    help: 'Number of times the adapter has disconnected'
  })
  originalAdapter.on(AdapterEvents.disconnected, () => {
    zigbee_herdsman_adapter_disconnected.inc(1)
  })
}
