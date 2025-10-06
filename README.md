# Keria - Web-based PostgreSQL Environment for Students

## Overview

Keria provides a simple, self-contained PostgreSQL environment designed for educational purposes. It allows students to interact with their own isolated PostgreSQL database through a web interface, without needing to install or configure a database server on their personal computers.

The entire environment runs within Docker, making setup and management straightforward for instructors. Each student is given their own user account and a dedicated database, ensuring a secure and sandboxed workspace.

---

## Features

* **Zero Local Installation**: Students only need a web browser. All server components run in Docker.
* **Isolated Environments**: Each student gets a unique PostgreSQL user and a private database named after them, preventing interference with other students' work.
* **Web-based SQL Editor**: A user-friendly interface for writing and executing SQL queries, managing schemas, and viewing results.
* **Simple Administration**: A set of command-line scripts for instructors to easily create, list, and delete student accounts.

---

## Prerequisites

* Docker
* Docker Compose

---

## Installation and Setup

1.  **Clone the Repository**
    Clone this project to your local machine.

2.  **Configure Environment**
    Create a configuration file by copying the example file:
    ```sh
    cp .env.example .env
    ```
    Open the newly created `.env` file and set a secure password for `POSTGRES_PASSWORD`. This password is for the main PostgreSQL administrator (`postgres` user) and is required to manage the database instance.

3.  **Build and Run the Environment**
    From the root directory of the project, run the following command to build the Docker images and start the services in the background:
    ```sh
    docker-compose up -d
    ```
    This will start two services: the PostgreSQL database and the Keria web application backend. The web interface will be available at `http://localhost:3000` by default.

---

## Usage

### Administrator (Instructor) Guide

All administrative tasks are performed using the provided shell scripts from your terminal.

* **Create a Student Account**
    To create a new user and a corresponding database for a student, run:
    ```sh
    ./create-student.sh <student_username> <student_password>
    ```
    For example:
    ```sh
    ./scripts/create-student.sh alice strongpassword123
    ```
    This command will create a user named `alice` and a database also named `alice`, owned by the new user.

* **List Student Accounts**
    To see a list of all created student users, run:
    ```sh
    ./scripts/list-students.sh
    ```
    This script queries the database and displays all non-superuser roles.

* **Delete a Student Account**
    To permanently remove a student's user and their entire database, run:
    ```sh
    ./scripts/delete-student.sh <student_username>
    ```
    This action is irreversible[cite: 2].

* **Access a Student's Database Directly**
    If you need to inspect or manage a student's database directly via the command line, use:
    ```sh
    ./scripts/sql-student.sh <student_username>
    ```
    This will open an interactive `psql` session connected to the specified student's database[cite: 1].

### Student Guide

1.  **Access Keria**
    Open your web browser and navigate to the URL provided by your instructor (e.g., `http://localhost:3000`).

2.  **Connect to Your Database**
    On the login screen, enter the username and password assigned to you by your instructor. Click the "Connect" button.

3.  **Use the Interface**
    Once connected, you will see the main interface which includes:
    * **Schema & Table List (Left Panel)**: View your database schemas and tables. You can also create new schemas here.
    * **Query Editor (Right Panel)**: Write your SQL queries in the text area.
    * **Execute Query**: Click the "Execute Query" button to run your code.
    * **Results Panel**: The results of your query will appear at the bottom, displayed in a table.

---

## Stopping the Environment

To stop all running services, execute the following command in the project's root directory:
```sh
docker-compose down
```

This will stop the containers, but any data in the database will be preserved in a Docker volume, so student work will not be lost. To start the services again, simply run docker-compose up -d.

## License

This project is licensed under the MIT License.