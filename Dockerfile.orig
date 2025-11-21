FROM node:22

WORKDIR /app

# Install build dependencies and all graphics/canvas libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    pkg-config \
    wget \
    libcairo2 \
    libcairo2-dev \
    libjpeg62-turbo \
    libjpeg62-turbo-dev \
    libpango-1.0-0 \
    libpango1.0-dev \
    libgif7 \
    libgif-dev \
    librsvg2-2 \
    librsvg2-dev \
    libpixman-1-0 \
    libpixman-1-dev \
    libgl1-mesa-glx \
    libgl1-mesa-dev \
    libglu1-mesa \
    libglu1-mesa-dev \
    && rm -rf /var/lib/apt/lists/*

# Download and install libjpeg8 from Debian archive
RUN wget -q https://archive.debian.org/debian/pool/main/libj/libjpeg8/libjpeg8_8b-1_amd64.deb -O /tmp/libjpeg8.deb && \
    dpkg -i /tmp/libjpeg8.deb && \
    rm /tmp/libjpeg8.deb

COPY package*.json ./

# Install npm packages
RUN npm install

COPY . .

CMD ["node", "main.js"]