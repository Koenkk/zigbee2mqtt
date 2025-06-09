#!/bin/sh
set -e

sanity_check_database_db() { # <path_to_database_db_file>
  # 'file' should be availabe in the container
  MIMETYPE=`file -b -i "${1:?}" | sed 's/;.*//; q;'`
  case "${MIMETYPE:-}" in
  application/*json|application/*jason)
    true
    ;;
  *)
    echo "Database contents of ${1:-} was not recognized as being JSON, rather ${MIMETYPE:-N/A}" 1>&2
    false
    ;;
  esac
}

if [ ! -z "$ZIGBEE2MQTT_DATA" ]; then
    DATA="$ZIGBEE2MQTT_DATA"
else
    DATA="/app/data"
fi

echo "Using '$DATA' as data directory"

DATABASE="$DATA/database.db"
if [ -f "$DATABASE" ]; then
    if sanity_check_database_db "$DATABASE"; then
        echo "Database file $DATABASE looks sane"
    else
        echo "Database file $DATABASE did not pass the sanity check!" 1>&2
        DATETIMESTAMP=`date +'%Y-%m-%dT%H:%M:%S%z'` # same format as -Isec
        RENAMED="$DATABASE.$DATETIMESTAMP~"
        mv "$DATABASE" "$RENAMED"
        echo "Renamed database file $DATABASE to $RENAMED"
        echo "Starting without database file"
    fi
fi

exec "$@"
