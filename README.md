# Naver

> **Event‑driven web scraping platform built with TypeScript, Playwright, and Fastify.**

This repository contains the **Naver** project: a scalable scraping service designed to handle high‑volume requests, concurrency, timeouts, worker orchestration, and bot‑aware HTTP behavior. The system emphasizes **correctness, observability, resource safety, and extensibility**.


## Overview

**Naver** is a scraping microservice that:

- Exposes an HTTP API to trigger scraping operations

- Uses Playwright for browser-level data extraction

- Manages persistent worker processes through IPC

- Applies timeouts, throttling, and request queues to protect system resources

- Safely handles large result sets and pagination

- Supports inter-process communication via Redis

- Is fully containerized and environment-agnostic

## Architecture

High‑level components:

* **API Server (Fastify)**

  * Receives client requests
  * Applies request limits and timeouts
  * Coordinates scraping jobs

* **Service Layer**

  * Orchestrates the scraping lifecycle
  * Manages job states and transitions

* **Worker Processes**

  * Forked sub processes
  * Execute scraping logic
  * Communicate with the main process via IPC

* **Playwright Runtime**

  * Manages browser, contexts, and pages
  * Ensures deterministic shutdown


## Usage

### Dependencies

The entire Naver system is designed to run fully containerized. The only required dependency on the host machine is Docker.

### Execution

Clone this repository:

``` shell
git clone git@github.com:paulocesarvasco/naver.git
```

Install dependencies:

``` shell
make build
```

Run application:

``` shell
make run
```

### Requests

#### Nave

Retrieves data from a single composite cards API URL.

``` http
GET /nave?url=https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1%26pageSize=50%26query=iphone%26listPage=1 HTTP/1.1
Host: 127.0.0.1:3000
```

#### Scan

Retrieves all products starting from a given composite cards API URL.
The provided URL is used as the initial search point, and subsequent pages are fetched until all items are collected.

``` http
GET /scan?url=https://search.shopping.naver.com/ns/v1/search/paged-composite-cards?cursor=1%26pageSize=50%26query=iphone%26listPage=1 HTTP/1.1
Host: 127.0.0.1:3000
```

### Configuration

Application configuration is defined in a .env file, which is loaded before building the local image (for simplicity). The required parameters are:

``` dotenv
PROXY_ADDRESS=proxy address
PROXY_USER=proxy username
PROXY_PASS=proxy password
WORKERS=number of concurrent scans

SERVER_PORT=local server port
SERVER_HOST=0.0.0.0  # Listen on all interfaces inside the container
SERVER_TIMEOUT=maximum time allowed for retrieving data from the composite cards API (used only by the /nave endpoint)

DB_PORT=local database port
DB_HOST=local database address (inside Docker network, use redis://naver-database)
```

### Monitoring

**cAdvisor** was added to the Docker Compose setup to monitor system behavior and resource usage. It helps observe container performance and supports configuration decisions such as memory allocation for the solution and the number of worker processes.

The monitoring dashboard can be accessed at:

``` http
http://localhost:8080/
```
