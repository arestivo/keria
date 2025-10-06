#!/bin/bash
# Usage: ./sql-student.sh student

docker exec -it keria_postgres psql -U $STUDENT -d ${STUDENT}
STUDENT=$1

if [ -z "$STUDENT" ]; then
  echo "Usage: $0 <student_name>"
  exit 1
fi

# Validate username
if ! [[ "$STUDENT" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "Invalid student username: $STUDENT"
  exit 1
fi

# Connect to the student's database as themselves
docker exec -it keria_postgres psql -U "${STUDENT}" -d "${STUDENT}"