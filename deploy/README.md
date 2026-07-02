# Deploy: prometheus-extension as a Home Assistant addon

Runs this branch (Prometheus exporter + the `tomwilkie/zigbee-herdsman#metrics-instrumentation`
fork) as a custom HA addon, overlaying our build onto the official edge addon image.

## Files

- `Dockerfile` — 2-stage build `FROM ghcr.io/zigbee2mqtt/zigbee2mqtt-edge-amd64:edge`. The deps
  stage installs this branch's exact prod closure from `pnpm-lock.yaml` (incl. `prom-client` and
  the git-hosted herdsman fork, which needs `NODE_ENV=development` to build its prepack, then
  `pnpm prune --prod`); the final stage overlays the locally-built `dist/` + `index.js`.
- `addon/config.json` — the Home Assistant local add-on definition. Points `image:` at the
  pushed build, exposes the Prometheus exporter on port 9142, and isolates its data under
  `data_path: /config/zigbee2mqtt-prometheus`.

## Build & push (from repo root, on a Mac)

```sh
pnpm install --frozen-lockfile && pnpm run build      # produce dist/
docker login -u tomwilkie
docker buildx build --platform linux/amd64 -f deploy/Dockerfile \
  -t docker.io/tomwilkie/zigbee2mqtt-prometheus-amd64:2.12.1-dev --push .
```

After branch changes, rebuild with a bumped tag and bump `version:` in `addon/config.json`.

## Install as a local addon (Home Assistant OS)

Copy `addon/config.json` into a directory under the host's local apps dir, then have the
Supervisor pick it up:

```sh
# host: /mnt/data/supervisor/apps/local/<dir>/config.json  (the addons->apps rename)
ssh root@homeassistant.local 'ha store reload'            # NOT `ha addons reload`
ssh root@homeassistant.local 'ha addons install local_zigbee2mqtt_prometheus'
```

Set `data_path: /config/zigbee2mqtt-prometheus` (a copy of the production data dir) and enable
the exporter by adding to that copy's `configuration.yaml`:

```yaml
prometheus_exporter:
  enabled: true
  port: 9142
```

Metrics are then served at `http://<ha-host>:9142/metrics`.

## Production isolation / rollback

The stable addon (`45df7312_zigbee2mqtt`) stores data at `/config/zigbee2mqtt`; the test addon
uses a separate copy at `/config/zigbee2mqtt-prometheus`, so production's database/state is never
touched. Only one addon may own the USB coordinator at a time. Roll back with:

```sh
ssh root@homeassistant.local 'ha addons stop local_zigbee2mqtt_prometheus && ha addons start 45df7312_zigbee2mqtt'
```
