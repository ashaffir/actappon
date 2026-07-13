FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Shared directory is mounted at runtime to /app/shared
# Need to make sure python can find it
ENV PYTHONPATH="${PYTHONPATH}:/app"

CMD ["python", "main.py"]
