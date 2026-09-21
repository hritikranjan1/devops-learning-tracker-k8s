# 🏗️ Architecture — DevOps Learning Tracker

This document explains the **complete architecture** of the DevOps Learning Tracker project — what pieces exist, why they exist, how they talk to each other, and what trade-offs were made.

It is written in **very simple language**. You do not need to be a senior engineer to understand it.

---

## 📑 Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [High-Level Architecture](#2-high-level-architecture)
3. [The Three Tiers Explained](#3-the-three-tiers-explained)
4. [Component Responsibilities](#4-component-responsibilities)
5. [Data Flow — End to End](#5-data-flow--end-to-end)
6. [Design Decisions (And Why)](#6-design-decisions-and-why)
7. [Trade-offs Made](#7-trade-offs-made)
8. [Networking Model](#8-networking-model)
9. [Storage Model](#9-storage-model)
10. [Configuration Model](#10-configuration-model)
11. [Deployment Model — Compose vs Kubernetes](#11-deployment-model--compose-vs-kubernetes)
12. [Scaling Model](#12-scaling-model)
13. [Failure Handling](#13-failure-handling)
14. [Security Architecture](#14-security-architecture)
15. [Non-Functional Requirements](#15-non-functional-requirements)
16. [Future Architecture (Scaling Up)](#16-future-architecture-scaling-up)
17. [Summary](#17-summary)

---

## 1. What Is This Project?

The **DevOps Learning Tracker** is a small web application that helps users track their DevOps learning journey.

Users can:

- Add topics they are learning (Docker, Kubernetes, AWS, etc.)
- Mark them as "Not Started", "In Progress" or "Completed"
- Track progress percentage
- See statistics like total topics, average progress, and completion count

The project exists to **demonstrate real-world DevOps practices**:

- Building and containerising a multi-service application
- Connecting services over a private network
- Persisting data across restarts
- Deploying the same stack on Docker Compose and Kubernetes

It is intentionally small so that **every design decision can be understood** without getting lost in business logic.

---

## 2. High-Level Architecture

Here is the entire system in one diagram:

```text
                          ┌──────────────────┐
                          │      User        │
                          │    (Browser)     │
                          └────────┬─────────┘
                                   │
                                   │  HTTP
                                   ▼
                   ┌───────────────────────────────┐
                   │           Nginx               │
                   │  ─────────────────────────    │
                   │  • Serves static frontend     │
                   │  • Reverse proxy for /api/*   │
                   │  • Single entry point         │
                   └────────────┬──────────────────┘
                                │
                                │  HTTP (proxy_pass)
                                ▼
                   ┌───────────────────────────────┐
                   │        Flask Backend          │
                   │  ─────────────────────────    │
                   │  • REST API                   │
                   │  • Business logic             │
                   │  • Talks to MySQL             │
                   └────────────┬──────────────────┘
                                │
                                │  MySQL protocol
                                ▼
                   ┌───────────────────────────────┐
                   │           MySQL               │
                   │  ─────────────────────────    │
                   │  • Stores learning_items      │
                   │  • ACID transactions          │
                   └────────────┬──────────────────┘
                                │
                                │  Reads / Writes
                                ▼
                   ┌───────────────────────────────┐
                   │   Persistent Storage          │
                   │   (Volume / PVC)              │
                   └───────────────────────────────┘
```

**Key idea:** Each tier is a **separate container**. They talk over the network. Only Nginx is exposed to the outside world.

---

## 3. The Three Tiers Explained

### 🎨 Tier 1 — Presentation (Frontend + Nginx)

**What it is:**

- Static HTML, CSS, JavaScript files
- Served by Nginx

**Why it is separate:**

- Static files do not need Python or a complex runtime
- Nginx is extremely fast at serving static content
- Nginx also acts as a **reverse proxy** for `/api/*` requests

**What it does:**

- Shows the dashboard to the user
- Makes AJAX calls to `/api/*` endpoints
- Displays statistics, learning cards and progress bars

**Who talks to it:**

- **User** (browser) → Nginx
- Nginx → Flask (for API calls)

---

### ⚙️ Tier 2 — Application (Flask Backend)

**What it is:**

- A Python Flask application
- Provides a REST API

**Why it is separate:**

- Business logic should be independent of the UI
- The same API could serve a mobile app, CLI, or another service
- It can be scaled horizontally (multiple replicas)

**What it does:**

- Handles HTTP requests
- Validates input
- Reads/writes data to MySQL
- Returns JSON responses

**Who talks to it:**

- Nginx (from inside the cluster, via Service `web`)
- Never directly from the user

---

### 🗄️ Tier 3 — Data (MySQL)

**What it is:**

- A MySQL 8.4 database
- Stores all learning items

**Why it is separate:**

- Data must persist even when the app is redeployed
- Databases have unique scaling and backup requirements
- Different security boundary

**What it does:**

- Stores rows in the `learning_items` table
- Handles transactions, indexes and queries

**Who talks to it:**

- Flask (via Service `db`)
- Never directly from the user or Nginx

---

## 4. Component Responsibilities

Here is a clear table of who does what:

| Component | Type | Responsibility | Talks To |
|-----------|------|----------------|----------|
| **Nginx** | Reverse proxy + static server | Serve frontend, proxy `/api/*` | Flask |
| **Flask** | Web app | Business logic, REST API | MySQL |
| **MySQL** | Database | Persistence, ACID | Volume/PVC |
| **Volume / PVC** | Storage | Survive restarts | Disk |
| **Namespace** | Logical boundary | Isolate resources | — |
| **ConfigMap** | Config | Non-secret values | Flask, MySQL |
| **Secret** | Config | Passwords | Flask, MySQL |
| **Service** | Networking | Stable name + load balancing | All tiers |
| **Deployment** | Controller | Runs pods, self-heals | Services |

---

## 5. Data Flow — End to End

Let us follow what happens when a user clicks **"Add Learning"** and saves a new topic.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1 — User action                                                │
│ Browser sends:                                                      │
│   POST http://<minikube-ip>:30082/api/learning                      │
│   Body: { "title": "Docker", "category": "Docker", ... }            │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2 — NodePort Service (nginx)                                   │
│ Forwards the request to one of the Nginx pods                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3 — Nginx pod                                                  │
│ Matches location /api/ → proxy_pass http://web:5000/api/learning    │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 4 — Service "web" (ClusterIP)                                  │
│ Resolves DNS name "web" to the Flask pod IP:5000                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 5 — Flask pod                                                  │
│  • Reads JSON body                                                  │
│  • Validates title, category, status                                │
│  • Reads DB_HOST=db, DB_USER, DB_PASSWORD from env                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 6 — Service "db" (ClusterIP)                                   │
│ Resolves DNS name "db" to MySQL pod IP:3306                         │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 7 — MySQL pod                                                  │
│  • Authenticates the user                                           │
│  • INSERT INTO learning_items (...) VALUES (...)                    │
│  • Writes to /var/lib/mysql (which is a PVC mount)                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 8 — Response flows back                                        │
│ MySQL → Flask → Nginx → Browser                                     │
│ Browser receives: { "message": "Learning item added", "id": 1 }     │
│ Toast appears: "✓ Learning added"                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Total components involved:** 1 browser, 3 Services, 3 pods, 1 PVC.

Each request goes through **all three tiers**, but the user only sees the final result.

---

## 6. Design Decisions (And Why)

Here is why I made each major decision.

### 🔸 Decision 1: Three-tier architecture

**Why:**

- Classic separation of concerns
- Frontend, backend and database evolve independently
- Teaches real-world patterns (most production apps follow this)

**Alternative:** A monolith — Flask serving HTML and DB calls all in one. Simpler but harder to scale.

---

### 🔸 Decision 2: Nginx in front of Flask

**Why:**

- Serves static files efficiently
- Acts as a reverse proxy, hiding Flask from the outside world
- Single entry point — only port 80 (NodePort 30082) exposed
- Can add rate limiting, caching, TLS later without touching Flask

**Alternative:** Expose Flask directly. Simpler but Flask is slower at static files, and you lose the proxy benefit.

---

### 🔸 Decision 3: Flask (not Django / FastAPI / Express)

**Why:**

- Minimal and easy to understand
- Great for small REST APIs
- Well-documented
- Fast to develop

**Alternative:** Django is heavier (good for large apps). FastAPI is faster and modern but adds async complexity. Node/Express is fine but I wanted Python.

---

### 🔸 Decision 4: MySQL (not PostgreSQL / MongoDB)

**Why:**

- Widely used and easy to run in Docker/K8s
- ACID guarantees — important for consistent data
- Data is structured (title, category, status, progress) → perfect for relational DB
- Great ecosystem and documentation

**Alternative:** PostgreSQL is objectively more advanced, but MySQL is more than sufficient here. MongoDB is overkill for this simple structure.

---

### 🔸 Decision 5: REST API (not GraphQL)

**Why:**

- Simple and stateless
- Easy to cache and debug
- Works great with JSON + AJAX
- No schema overhead for 5 endpoints

**Alternative:** GraphQL adds flexibility but too much boilerplate for this small app.

---

### 🔸 Decision 6: Kubernetes over Docker Compose

**Why:**

- Demonstrates production-grade orchestration
- Teaches concepts like Probes, PVCs, Secrets, Services
- Compose is great for local dev but not for production

**Note:** The project supports **both** — Compose for local dev, Kubernetes for orchestration practice.

---

### 🔸 Decision 7: NodePort instead of Ingress

**Why:**

- Simplest way to expose a service in Minikube
- No extra addon required
- Good enough for local testing

**Alternative:** Ingress is more production-friendly (hostnames, TLS). Planned as a future improvement.

---

## 7. Trade-offs Made

Every project makes compromises. Here are mine, openly documented.

| Trade-off | What I Gave Up | What I Gained |
|-----------|---------------|---------------|
| **Single MySQL replica** | No high availability | Simplicity, no replication setup |
| **Recreate strategy for MySQL** | Small downtime on updates | No PVC conflicts |
| **Secrets in plain YAML (dummy)** | Not production-secure | Easy to demo, no external dependencies |
| **NodePort instead of Ingress** | No TLS, ugly URL | Zero extra setup |
| **No caching layer** | Higher DB load | Simpler architecture |
| **No authentication** | Anyone can use the app | Focus on infrastructure, not auth |
| **Single namespace** | No env separation (dev/prod) | Simple and clear |
| **No autoscaling** | Manual scaling only | Predictable resource use |
| **No distributed tracing** | Harder to debug at scale | Less tooling to maintain |

These trade-offs are **fine for a learning project**. For production, each would need to be revisited.

---

## 8. Networking Model

### Docker Compose Networking

```text
Compose creates a bridge network called "devops_network".

All services are attached to it.
Each service gets a DNS name = service name.
```

| From | To | Hostname | Port |
|------|-----|----------|------|
| Flask | MySQL | `db` | 3306 |
| Nginx | Flask | `web` | 5000 |
| User | Nginx | `localhost` | 8082 (host port) |

### Kubernetes Networking

```text
Every Service gets:
- A ClusterIP (stable internal IP)
- A DNS name (same as Service name)
- Load balancing across pods matching the selector
```

| From | To | Hostname | Port |
|------|-----|----------|------|
| Flask pod | MySQL Service | `db` | 3306 |
| Nginx pod | Flask Service | `web` | 5000 |
| User | Nginx NodePort | `<minikube-ip>` | 30082 |

### Why this works

- Pods can die and restart — Service IPs do not change
- You never hardcode pod IPs
- DNS is handled by CoreDNS (in K8s) or Docker's embedded DNS (in Compose)

---

## 9. Storage Model

### Why we need storage

Containers are **ephemeral**. When a container dies, its filesystem is gone.

Without external storage, MySQL would lose all data on every restart. Terrible.

### Docker Compose — Named Volume

```yaml
volumes:
  - mysql_data:/var/lib/mysql
```

- Docker manages the volume
- Stored under `/var/lib/docker/volumes/`
- Survives `docker compose down`
- Deleted with `docker compose down -v`

### Kubernetes — PVC + PV

```yaml
volumeMounts:
  - name: mysql-data
    mountPath: /var/lib/mysql
volumes:
  - name: mysql-data
    persistentVolumeClaim:
      claimName: mysql-pvc
```

- PVC is a **request** for storage
- K8s binds it to a PV (PersistentVolume)
- PV is backed by actual disk (local, EBS, etc.)
- Data survives pod deletion, Deployment deletion, even node restart

### Special considerations

- **ReadWriteOnce** — only one pod can mount it read-write. Perfect for MySQL.
- **fsGroup: 999** — needed so MySQL user can write to the volume.
- **Corrupted PVC** — if MySQL crashes mid-init, delete the PVC and start fresh.

---

## 10. Configuration Model

Configuration is separated from code. Same image, different environments.

### Non-secret values → ConfigMap / .env

| Key | Value | Where |
|-----|-------|-------|
| `DB_HOST` | `db` | Compose `.env` / K8s ConfigMap |
| `DB_NAME` | `devops_tracker` | Compose `.env` / K8s ConfigMap |

### Secret values → Secret / .env

| Key | Value | Where |
|-----|-------|-------|
| `MYSQL_ROOT_PASSWORD` | hidden | Compose `.env` / K8s Secret |
| `MYSQL_USER` | hidden | Compose `.env` / K8s Secret |
| `MYSQL_PASSWORD` | hidden | Compose `.env` / K8s Secret |

### How containers consume them

**Docker Compose:**

```yaml
environment:
  DB_HOST: db
  DB_USER: ${MYSQL_USER}
  DB_PASSWORD: ${MYSQL_PASSWORD}
```

**Kubernetes:**

```yaml
env:
  - name: DB_HOST
    valueFrom:
      configMapKeyRef: { name: db-config, key: DB_HOST }
  - name: DB_USER
    valueFrom:
      secretKeyRef: { name: db-secret, key: MYSQL_USER }
```

### Why separate config from code?

- Same image works in dev, staging and prod
- Change config without rebuilding
- Rotate secrets without touching code
- Easy to audit

---

## 11. Deployment Model — Compose vs Kubernetes

Here is how the same logical stack maps to each tool:

| Concept | Docker Compose | Kubernetes |
|---------|---------------|------------|
| Service container | `services.<name>` | Deployment |
| Internal DNS | Service name on bridge network | Service (ClusterIP) |
| External access | `ports:` mapping | NodePort / LoadBalancer / Ingress |
| Health check | `healthcheck:` | readinessProbe + livenessProbe |
| Start ordering | `depends_on: service_healthy` | initContainer |
| Persistent storage | Named volume | PVC + PV |
| Config | `.env` | ConfigMap |
| Secrets | `.env` (or Compose secrets) | Secret |
| Resource limits | `mem_limit`, `cpus` | `resources.limits` |
| Scaling | `--scale` flag | `replicas` + HPA |
| Self-healing | Restart policy | Full controller-based |

**Summary:** Kubernetes has a steeper learning curve but is more powerful.

---

## 12. Scaling Model

### Current state (this project)

- **Flask:** 1 replica
- **MySQL:** 1 replica
- **Nginx:** 1 replica

Everything runs on one node (Minikube).

### Horizontal scaling — Flask

Flask is stateless. Each request contains all needed info. No session data is stored in memory. So Flask scales beautifully:

```bash
kubectl scale deployment web -n devtrack --replicas=5
```

The `web` Service automatically load-balances across all 5 pods.

For automatic scaling, use an **HorizontalPodAutoscaler**:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
spec:
  scaleTargetRef:
    kind: Deployment
    name: web
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### Vertical scaling — resource limits

CPU and memory can be increased per pod:

```yaml
resources:
  requests: { memory: "256Mi", cpu: "250m" }
  limits:   { memory: "512Mi", cpu: "500m" }
```

### Why not scale MySQL this way?

MySQL is **stateful**:

- It writes to a single PVC (ReadWriteOnce)
- It cannot share the same data with another MySQL process

To scale MySQL, you would need:

- A **StatefulSet** with per-pod PVCs
- Master-slave replication
- A proxy (ProxySQL, MySQL Router) for read splitting

For this project, 1 MySQL replica is enough.

---

## 13. Failure Handling

What happens when things go wrong?

### Container crashes

- **K8s:** The kubelet restarts the container inside the pod
- **Compose:** The restart policy (e.g. `unless-stopped`) restarts it

### Pod crashes

- **K8s:** The ReplicaSet controller creates a new pod to match `replicas`
- **Compose:** Only if the container is restarted by restart policy

### Node goes down

- **K8s:** Pods on that node are rescheduled to healthy nodes
- **Compose:** No equivalent — everything is on one host

### Database unavailable

- Flask's `initialize_database()` has a retry loop (10 attempts, 3s apart)
- The K8s initContainer waits for MySQL before starting Flask

### PVC corrupted

- MySQL cannot recover
- The correct fix is: delete the PVC, restart MySQL (it initialises cleanly)

### Bad code deployment

- **K8s:** `kubectl rollout undo` rolls back
- **Compose:** Rebuild with the previous image

### Health probes

- **readinessProbe:** Removes pod from service endpoints if unhealthy (no traffic sent)
- **livenessProbe:** Restarts pod if unhealthy (assumes it is stuck)

---

## 14. Security Architecture

### What we protect

- Database credentials
- Application code
- User data

### Layers of security

#### 1. Network isolation

- MySQL is only reachable via ClusterIP (not exposed)
- Flask is only reachable via ClusterIP (not exposed)
- Only Nginx is exposed externally (NodePort)

#### 2. Container security

- Flask runs as a **non-root user**
- Uses minimal base images
- No unnecessary tools installed

#### 3. Secret management

- Passwords stored in Kubernetes Secrets (not in Deployment YAML)
- Real `.env` is gitignored
- Repo contains only `.env.example`

#### 4. Resource isolation

- Memory and CPU limits prevent one service from starving others
- A misbehaving pod cannot exhaust the node

#### 5. Namespace isolation

- All resources live in the `devtrack` namespace
- Easy to delete everything with one command
- Can apply RBAC at the namespace level

### Known limitations (be honest)

- Secrets are base64-encoded in etcd, not encrypted by default
- No TLS between services
- No authentication on the API
- Single replica = single point of failure
- No network policies restricting pod-to-pod traffic

These are acceptable for a learning project but would need to be addressed in production.

---

## 15. Non-Functional Requirements

### Availability

- **Target:** works reliably during local dev
- **Current:** single replica of each service
- **Production target:** 99.9% uptime (requires HA DB, multiple replicas)

### Scalability

- **Flask:** horizontal (stateless)
- **Nginx:** horizontal (stateless)
- **MySQL:** not horizontally scalable in current design

### Performance

- **Target:** p95 latency under 500ms
- **Current:** well under that for a single user

### Security

- Credentials protected via Secrets
- No root containers
- Only necessary ports exposed

### Maintainability

- Simple structure (three tiers)
- Clear YAML separation in `k8s/`
- Extensive documentation in this repo

### Observability

- Logs via `kubectl logs`
- Health endpoints via `/api/health`
- No metrics/tracing (future scope)

---

## 16. Future Architecture (Scaling Up)

If this project were to become a real product, here is how the architecture would evolve:

```text
                     ┌──────────────────────┐
                     │    CDN (static)      │
                     └──────────┬───────────┘
                                │
                                ▼
                     ┌──────────────────────┐
                     │   Ingress + TLS      │
                     │  (cert-manager)      │
                     └──────────┬───────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │           Nginx (multi-replica)               │
        └───────────────────────┬───────────────────────┘
                                │
                                ▼
        ┌───────────────────────────────────────────────┐
        │       Flask (multi-replica + HPA)             │
        │       + Redis for cache / sessions            │
        └───────────────────────┬───────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
        ┌───────────────┐               ┌───────────────┐
        │  MySQL        │               │  MySQL        │
        │  Primary      │ ──replica──►  │  Replica      │
        │  (writes)     │               │  (reads)      │
        └───────┬───────┘               └───────────────┘
                │
                ▼
        ┌───────────────┐
        │  Automated    │
        │  Backups      │
        └───────────────┘

        + Prometheus + Grafana (metrics)
        + Loki + Fluent Bit (logs)
        + Jaeger / OTel (traces)
        + Velero (backup/restore)
        + External Secrets (Vault / AWS SM)
```

### Improvements to make

1. **Ingress** — replace NodePort with hostname-based routing + TLS
2. **HPA** — auto-scale Flask based on CPU
3. **StatefulSet for MySQL** — production-grade with replication
4. **Redis** — caching layer
5. **Auth** — JWT or OAuth2
6. **Prometheus + Grafana** — metrics and dashboards
7. **Loki** — centralised logs
8. **External Secrets** — proper secret management
9. **Network Policies** — restrict pod-to-pod traffic
10. **CI/CD** — GitHub Actions or GitLab CI

---

## 17. Summary

### The architecture in one paragraph

**DevOps Learning Tracker** is a three-tier application. The **frontend** is served by **Nginx**, which also acts as a reverse proxy. The **backend** is a **Flask** REST API. The **database** is **MySQL**, with persistent storage via a volume (Compose) or PVC (Kubernetes). All three tiers communicate over internal Service DNS. Only Nginx is exposed to the user via a NodePort. The stack runs identically on Docker Compose (local dev) and Kubernetes (orchestration practice). Configuration is separated into ConfigMap and Secret, health is verified via probes, and data survives restarts via persistent storage.

### Why this architecture is a good learning project

- It mirrors real production patterns
- Every design decision has a clear reason and a trade-off
- It covers networking, storage, configuration, security, health, scaling, and orchestration
- Both Docker Compose and Kubernetes variants are shown
- Every issue faced during the project is documented in `ISSUES.md`

### What this project does not do (and why)

- No TLS — out of scope for local dev
- No auth — out of scope for a learning app
- No HA database — single replica is enough
- No autoscaling — added complexity
- No monitoring stack — planned as future scope

Being honest about what you did **not** build is just as important as explaining what you **did** build.

---

## 👨‍💻 Author

**Hritik Ranjan**
DevOps & Cloud Learner

- GitHub: https://github.com/hritikranjan1
- LinkedIn: https://www.linkedin.com/in/hritikranjan1/
- Blog: https://blogs.hritikranjan.in
- Website: https://hritikranjan.in

---

**This document answers the question "why" behind everything in the project. Read it once, and you will be able to defend any design choice in an interview. 🚀**