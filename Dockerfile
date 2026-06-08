FROM node:20

RUN apt-get update && apt-get install -y python3 python3-pip

WORKDIR /app

COPY . .

RUN npm install

RUN pip3 install --no-cache-dir -r flask_app/requirements.txt

EXPOSE 4000

CMD ["npm", "start"]