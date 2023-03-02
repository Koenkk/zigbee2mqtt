import metrics, { Gauge, Summary } from 'prom-client'
import * as settings from '../../util/settings';
import utils from '../../util/utils';

export async function createZ2MMetrics(
  zigbee: Zigbee,
  mqtt: MQTT,
  state: State
) {
  const zigbee2mqttVersion = await utils.getZigbee2MQTTVersion();
  const coordinator = await zigbee.getCoordinatorVersion()

  const zigbee2mqttLabel = `${zigbee2mqttVersion.version}-${zigbee2mqttVersion.commitHash}`
  const coordinatorLabel = `${coordinator?.type ?? 'unknown'}@${coordinator?.meta?.revision ?? 'unknown'}`

  metrics.register.setDefaultLabels({
    zigbee2mqtt: zigbee2mqttLabel,
    coordinator: coordinatorLabel
  })

  // Enable generic nodejs process metrics
  // see https://github.com/siimon/prom-client#default-metrics
  if (settings.get().metrics.nodejs_metrics) {
    metrics.collectDefaultMetrics();
  }

  // Define zigbee2mqtt metrics
  new metrics.Gauge({
    name: 'zigbee_device_joined_count',
    help: 'Number of devices joined to the network (excluding coordinator)',
    collect() {
      this.set(zigbee.devices(false).length)
    }
  })

  const device_last_seen_summary = new Summary({
    name: 'zigbee_device_last_seen_summary',
    help: 'Seconds since device was last seen, percentile'
  })
  new Gauge({
    name: 'zigbee_device_last_seen',
    help: 'Seconds since device was last seen, labeled by device ieee address',
    labelNames: ['ieeeAddr'],
    collect() {
      const now = Date.now();
      device_last_seen_summary.reset()
      this.reset()

      for (const device of zigbee.devices(false)) {
        const lastSeenElapsedSeconds = Math.round((now - device.zh.lastSeen) / 1000)
        if (settings.get().metrics.per_device_labels) {
          this.set({ ieeeAddr: device.ieeeAddr }, lastSeenElapsedSeconds)
        }
        device_last_seen_summary.observe(lastSeenElapsedSeconds)
      }
    }
  })

  const device_lqi_summary = new Summary({
    name: 'zigbee_device_lqi_summary',
    help: 'Device link quality index (when available), percentile'
  })
  new Gauge({
    name: 'zigbee_device_lqi',
    help: 'Device link quality index (when available), labeled by device ieee address',
    labelNames: ['ieeeAddr'],
    collect() {
      device_lqi_summary.reset()
      this.reset()
      for (const device of zigbee.devices(false)) {
        const lqi = device.zh.linkquality

        if (lqi !== undefined) {
          if (settings.get().metrics.per_device_labels) {
            this.set({ ieeeAddr: device.ieeeAddr }, lqi)
          }
          device_lqi_summary.observe(lqi)
        }
      }
    }
  })

  new Gauge({
    name: 'zigbee_device_battery',
    help: 'Battery status for battery-powered devices, labeled by device ieee address',
    labelNames: ['ieeeAddr'],
    collect() {
      this.reset()
      for (const device of zigbee.devices(false)) {
        const battery = state.get(device)?.battery

        if (battery !== undefined) {
          if (settings.get().metrics.per_device_labels) {
            this.set({ ieeeAddr: device.ieeeAddr }, battery)
          }
        }
      }

    }
  })

  new metrics.Gauge({
    name: 'zigbee_mqtt_connected',
    help: '1 if zigbee2mqtt is connected to downstream mqtt server, otherwise 0',
    collect() {
      this.set(mqtt.isConnected() ? 1 : 0)
    }
  })

  new metrics.Gauge({
    name: 'zigbee_permit_join',
    help: '1 if network is in Permit Join mode, otherwise 0',
    collect() {
      this.set(zigbee.getPermitJoin() ? 1 : 0)
    }
  })

}

