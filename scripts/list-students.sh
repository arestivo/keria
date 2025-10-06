#!/bin/bash
# Usage: ./list-students.sh

docker exec -i keria_postgres psql -U postgres -d postgres -c "\du"