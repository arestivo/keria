#!/bin/bash
# Usage: ./delete-student.sh student

STUDENT=$1

if [ -z "$STUDENT" ]; then
  echo "Usage: $0 <student_name>"
  exit 1
fi

# Drop the student's database if it exists
docker exec -i keria_postgres psql -U postgres -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='${STUDENT}'" | grep -q 1 \
  && docker exec -i keria_postgres psql -U postgres -d postgres \
       -c "DROP DATABASE ${STUDENT};"

# Drop the user if it exists
docker exec -i keria_postgres psql -U postgres -d postgres -tAc \
  "SELECT 1 FROM pg_roles WHERE rolname='${STUDENT}'" | grep -q 1 \
  && docker exec -i keria_postgres psql -U postgres -d postgres \
       -c "DROP USER ${STUDENT};"