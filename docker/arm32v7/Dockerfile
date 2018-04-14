FROM arm32v7/node

# Copy files
ADD . /app
RUN cp /app/data/configuration.yaml /app

# Create startup script.
RUN echo '#!/bin/bash\n\
cp -n /app/configuration.yaml /app/data/configuration.yaml\n\
npm start\n'\
>> /app/start.sh
RUN chmod +x /app/start.sh

WORKDIR /app
RUN npm install
ENTRYPOINT ["./start.sh"]