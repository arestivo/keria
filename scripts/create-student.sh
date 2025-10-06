#!/bin/bash
# Usage: ./create-student.sh student password

STUDENT=$1
PASSWORD=$2

if [ -z "$STUDENT" ] || [ -z "$PASSWORD" ]; then
  echo "Usage: $0 <student_name> <password>"
  exit 1
fi

# Validate student username (lowercase letters, numbers and underscore, cannot start with number)
if ! [[ "$STUDENT" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "Invalid student username: $STUDENT"
  echo "Allowed: lowercase letters, numbers and underscore, start with letter or underscore"
  exit 1
fi

# Escape single quotes in password for SQL literal
PW_ESCAPED=$(printf "%s" "$PASSWORD" | sed "s/'/''/g")

# Create user if it doesn't exist (password is safely escaped)
docker exec -i keria_postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${STUDENT}'" | grep -q 1 || \
  docker exec -i keria_postgres psql -U postgres -d postgres -c "CREATE USER \"${STUDENT}\" WITH PASSWORD '${PW_ESCAPED}';"

# Create database if it doesn't exist (must be run outside of transaction)
docker exec -i keria_postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${STUDENT}'" | grep -q 1 || \
  docker exec -i keria_postgres psql -U postgres -d postgres -c "CREATE DATABASE \"${STUDENT}\" OWNER \"${STUDENT}\";"

# Revoke public connect to the student's DB (extra safety)
docker exec -i keria_postgres psql -U postgres -d postgres -c "REVOKE CONNECT ON DATABASE \"${STUDENT}\" FROM PUBLIC;"