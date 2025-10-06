#!/bin/bash
# Usage: ./sql-student.sh student

STUDENT=$1

if [ -z "$STUDENT" ]; then
  echo "Usage: $0 <student_name>"
  exit 1
fi

# Connect to the student's database as themselves
docker exec -it keria_postgres psql -U $STUDENT -d ${STUDENT}