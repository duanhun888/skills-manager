FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY review_gate.py app.py ./

ENV HOST=0.0.0.0
ENV PORT=9090

EXPOSE 9090

CMD ["sh", "-c", "uvicorn app:app --host ${HOST} --port ${PORT}"]
