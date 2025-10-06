#!/bin/bash
# Usage: ./create-student.sh student password

STUDENT=$1
PASSWORD=$2

if [ -z "$STUDENT" ] || [ -z "$PASSWORD" ]; then
  echo "Usage: $0 <student_name> <password>"
  exit 1
fi

# Create user if it doesn't exist
docker exec -i keria_postgres psql -U postgres -d postgres -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='${STUDENT}'" | grep -q 1 \
  || docker exec -i keria_postgres psql -U postgres -d postgres \
       -c "CREATE USER ${STUDENT} WITH PASSWORD '${PASSWORD}';"

# Create database if it doesn't exist
docker exec -i keria_postgres psql -U postgres -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${STUDENT}'" | grep -q 1 \
  || docker exec -i keria_postgres psql -U postgres -d postgres \
       -c "CREATE DATABASE ${STUDENT} OWNER ${STUDENT};"

docker exec -i keria_postgres psql -U postgres -d postgres \
  -c "REVOKE CONNECT ON DATABASE ${STUDENT}	FROM PUBLIC;"