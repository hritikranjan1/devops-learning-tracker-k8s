from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import os
import time

app = Flask(__name__)
CORS(app)


def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME")
    )

def initialize_database():
    for attempt in range(10):
        try:
            connection = get_db_connection()
            cursor = connection.cursor()

            cursor.execute("""
                CREATE TABLE IF NOT EXISTS learning_items (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    category VARCHAR(100) NOT NULL,
                    status VARCHAR(50) NOT NULL,
                    progress INT NOT NULL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            connection.commit()
            cursor.close()
            connection.close()

            print("Database initialized successfully.")
            return

        except mysql.connector.Error as error:
            print(f"Database connection failed: {error}")
            print("Retrying in 3 seconds...")
            time.sleep(3)

    raise Exception("Could not connect to database.")


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "service": "flask"
    })


@app.route("/api/learning", methods=["GET"])
def get_learning_items():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT id, title, category, status, progress, created_at
        FROM learning_items
        ORDER BY id DESC
    """)

    items = cursor.fetchall()

    cursor.close()
    connection.close()

    return jsonify(items)


@app.route("/api/learning", methods=["POST"])
def add_learning_item():
    data = request.get_json()

    title = data.get("title")
    category = data.get("category")
    status = data.get("status")
    progress = data.get("progress", 0)

    if not title or not category or not status:
        return jsonify({
            "error": "Title, category and status are required."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute("""
        INSERT INTO learning_items
        (title, category, status, progress)
        VALUES (%s, %s, %s, %s)
    """, (title, category, status, progress))

    connection.commit()

    new_id = cursor.lastrowid

    cursor.close()
    connection.close()

    return jsonify({
        "message": "Learning item added successfully.",
        "id": new_id
    }), 201


@app.route("/api/learning/<int:item_id>", methods=["PUT"])
def update_learning_item(item_id):
    data = request.get_json()

    title = data.get("title")
    category = data.get("category")
    status = data.get("status")
    progress = data.get("progress")

    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE learning_items
        SET title = %s,
            category = %s,
            status = %s,
            progress = %s
        WHERE id = %s
    """, (title, category, status, progress, item_id))

    connection.commit()

    cursor.close()
    connection.close()

    return jsonify({
        "message": "Learning item updated successfully."
    })


@app.route("/api/learning/<int:item_id>", methods=["DELETE"])
def delete_learning_item(item_id):
    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute(
        "DELETE FROM learning_items WHERE id = %s",
        (item_id,)
    )

    connection.commit()

    cursor.close()
    connection.close()

    return jsonify({
        "message": "Learning item deleted successfully."
    })


if __name__ == "__main__":
    initialize_database()

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False
    )