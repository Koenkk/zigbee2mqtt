{{/* vim: set filetype=mustache: */}}

{{/* Expand the name of the chart.*/}}
{{- define "zigbee2mqtt.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "zigbee2mqtt.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}


{{/* labels for helm resources */}}
{{- define "zigbee2mqtt.labels" -}}
app.kubernetes.io/instance: "{{ .Release.Name }}"
app.kubernetes.io/managed-by: "{{ .Release.Service }}"
app.kubernetes.io/name: "{{ template "zigbee2mqtt.name" . }}"
app.kubernetes.io/version: "{{ .Chart.AppVersion }}"
helm.sh/chart: "{{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}"
{{- if .Values.customLabels }}
{{ toYaml .Values.customLabels | indent 2 -}}
{{- end }}
{{- end }}