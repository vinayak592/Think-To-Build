FROM node:20

RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app

COPY . .

RUN npm install --prefix backend
RUN pip3 install --break-system-packages --no-cache-dir -r flask_app/requirements.txt

ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]