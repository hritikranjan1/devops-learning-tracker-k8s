# 🎤 Interview Questions & Answers — DevOps Learning Tracker Project

This file contains the **most likely interview questions** based on this project, along with **detailed but simple answers**.

It is organized by topic:

1. [Project Overview](#1-project-overview)
2. [Docker & Containerisation](#2-docker--containerisation)
3. [Docker Compose](#3-docker-compose)
4. [Kubernetes Basics](#4-kubernetes-basics)
5. [Kubernetes Deployments & Pods](#5-kubernetes-deployments--pods)
6. [Kubernetes Services & Networking](#6-kubernetes-services--networking)
7. [Kubernetes Storage (Volumes & PVC)](#7-kubernetes-storage-volumes--pvc)
8. [ConfigMaps & Secrets](#8-configmaps--secrets)
9. [Health Probes & Lifecycle](#9-health-probes--lifecycle)
10. [Resource Management](#10-resource-management)
11. [Troubleshooting & Real Issues](#11-troubleshooting--real-issues)
12. [Comparison: Docker Compose vs Kubernetes](#12-comparison-docker-compose-vs-kubernetes)
13. [Real-World & Scenario Questions](#13-real-world--scenario-questions)
14. [Behavioural Questions](#14-behavioural-questions)

If a recruiter asks anything about this project, chances are you will find the answer here.

---

## 1. Project Overview

### Q1.1 — Tell me about this project.

**Answer:**

This is a **three-tier web application** called **DevOps Learning Tracker**. It helps users track their DevOps learning journey — add topics, mark them as "In Progress" or "Completed", and see statistics like total topics and average progress.

The three tiers are:

1. **Frontend + Nginx** — a browser UI with a reverse proxy.
2. **Backend (Flask)** — a REST API that handles CRUD operations.
3. **Database (MySQL)** — stores data permanently.

I first built it with **Docker Compose** to learn containerisation and multi-service communication, then migrated the entire stack to **Kubernetes (Minikube)** to learn production-grade orchestration.

**Key things I implemented:**

- Multi-service communication over a private network
- Database persistence using volumes / PVCs
- Reverse proxy with Nginx
- Health checks and readiness probes
- Secrets and ConfigMaps for configuration
- Resource limits
- A complete debugging journey documented in `ISSUES.md`

---

### Q1.2 — Why did you choose this project?

**Answer:**

I wanted a project that would touch **every layer of a real application**:

- A frontend
- A backend API
- A database
- A reverse proxy

Most tutorials only build one piece. This project forced me to solve **real problems** like service discovery, dependency ordering, persistence, secrets, and health checks — which are exactly the problems Kubernetes was designed for.

The migration from Compose to Kubernetes also taught me the **differences** between the two tools, which is very valuable in interviews.

---

### Q1.3 — What was the most challenging part?

**Answer:**

The most challenging part was **migrating from Docker Compose to Kubernetes** without breaking anything.

Docker Compose has convenient features like `depends_on: condition: service_healthy`, named volumes, and simple port mappings. Kubernetes has none of these directly — you have to build them yourself using:

- `initContainers` (instead of `depends_on`)
- `PersistentVolumeClaims` (instead of named volumes)
- `NodePort` Services (instead of `ports:` mapping)
- `readinessProbe` and `livenessProbe` (instead of `healthcheck`)

Another big challenge was **MySQL on Kubernetes** — the first version kept crashing with **corrupted InnoDB redo logs** because the liveness probe was killing MySQL during first-time initialisation. I had to:

1. Increase `initialDelaySeconds` on the liveness probe.
2. Add `securityContext.fsGroup: 999` so the mysql user could write to the PVC.
3. Delete the corrupted PVC and redeploy.

That debugging journey is documented in detail in `ISSUES.md`.

---

## 2. Docker & Containerisation

### Q2.1 — What is a container?

**Answer:**

A **container** is a lightweight, portable way to package an application with all its dependencies (libraries, binaries, config files) so it can run the same way on any machine.

Containers share the **host OS kernel**, which makes them much lighter than virtual machines. Each container has its own isolated filesystem, network, and process space.

In this project:
- The **backend container** has Python + Flask + dependencies.
- The **nginx container** has Nginx + the frontend files.
- The **MySQL container** has the MySQL server.

---

### Q2.2 — What is a Dockerfile?

**Answer:**

A **Dockerfile** is a text file with instructions to build a Docker image. Each instruction creates a layer.

Simple example from my project (backend):

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["python", "app.py"]
```

- `FROM` — base image
- `WORKDIR` — sets the working directory
- `COPY` — copies files from host to image
- `RUN` — runs a command at build time
- `EXPOSE` — documents the port
- `CMD` — the default command when the container runs

---

### Q2.3 — What is the difference between an image and a container?

**Answer:**

- **Image** — a read-only template. Like a class in programming.
- **Container** — a running instance of an image. Like an object in programming.

You can create many containers from the same image. Containers have a writable layer on top of the image.

In my project, `hritikranjan1/devops-learning-tracker-backend:1.0` is an image. Every time Kubernetes starts a pod with it, a new container is created.

---

### Q2.4 — What is a multi-stage build? Did you use it?

**Answer:**

A **multi-stage build** uses multiple `FROM` statements in one Dockerfile to keep the final image small. You build heavy things (like compilers) in one stage and copy only the output to a minimal final stage.

I did **not** use multi-stage builds in this project because the images are already small. But I could have, for example, if the Flask app required compiled dependencies. The idea is:

```dockerfile
# Stage 1 — build
FROM python:3.11 AS builder
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# Stage 2 — runtime
FROM python:3.11-slim
COPY --from=builder /root/.local /root/.local
COPY . /app
WORKDIR /app
CMD ["python", "app.py"]
```

---

## 3. Docker Compose

### Q3.1 — What is Docker Compose and why did you use it?

**Answer:**

**Docker Compose** is a tool to define and run **multi-container applications** using a single YAML file (`docker-compose.yml`).

I used it as the **first stage** of my project because:

- It is simple to learn
- It lets me define all three services (frontend, backend, db) in one file
- It handles networking automatically
- It manages volumes and environment variables

Once I understood this well, I moved to Kubernetes for more advanced orchestration.

---

### Q3.2 — How does Compose handle service-to-service communication?

**Answer:**

Compose creates a **default bridge network** and attaches all services to it. Each service gets a DNS name equal to its service name.

In my project:
- Flask connects to MySQL using `DB_HOST=db`
- Nginx proxies to Flask using `proxy_pass http://web:5000`

Because they are on the same Compose network, they can resolve each other by service name.

---

### Q3.3 — What is `depends_on` in Compose?

**Answer:**

`depends_on` tells Compose to start one service before another. But it has a **gotcha**: by default it only waits for the container to **start**, not to be **ready**.

So `depends_on: [db]` does not guarantee MySQL is ready when Flask starts.

The proper way in my project was:

```yaml
depends_on:
  db:
    condition: service_healthy
```

Combined with a healthcheck on MySQL. This waits until the healthcheck passes.

---

### Q3.4 — Why is `condition: service_healthy` better than a simple `depends_on`?

**Answer:**

Because MySQL takes **20-30 seconds** to initialise on first start. A simple `depends_on` would start Flask immediately, and Flask would crash with `Can't connect to MySQL`.

`condition: service_healthy` waits for the healthcheck (`mysqladmin ping`) to pass, ensuring MySQL is truly ready.

I used both:
1. `condition: service_healthy` in Compose
2. A retry loop in the Flask app (up to 10 attempts, 3 seconds apart)

This is belt-and-braces — safe even if the healthcheck misbehaves.

---

## 4. Kubernetes Basics

### Q4.1 — What is Kubernetes?

**Answer:**

**Kubernetes** (K8s) is an open-source **container orchestration platform**. It manages the lifecycle of containerised applications across a cluster of machines.

It handles:

- **Deployment** — starting containers
- **Scaling** — adding/removing replicas
- **Self-healing** — restarting failed containers
- **Service discovery** — letting services talk to each other
- **Load balancing** — distributing traffic
- **Rolling updates** — deploying new versions without downtime
- **Configuration** — managing secrets and configs

In this project, Kubernetes runs three Deployments (MySQL, Flask, Nginx) with Services, PVCs, ConfigMaps and Secrets.

---

### Q4.2 — What is Minikube? Why did you use it?

**Answer:**

**Minikube** is a tool that runs a **single-node Kubernetes cluster** on your laptop — perfect for learning and local development.

I used it because:

- I did not want to pay for a cloud Kubernetes cluster
- It works on any local machine with Docker
- It supports all the important Kubernetes features (Pods, Services, PVCs, Secrets, etc.)

It gave me the full Kubernetes experience without needing AWS, GCP, or Azure.

---

### Q4.3 — What is the difference between a Pod and a container?

**Answer:**

- **Container** — a single running instance of an image.
- **Pod** — the smallest deployable unit in Kubernetes. It can contain **one or more containers** that share:

  - The same network namespace (so they can talk via `localhost`)
  - The same storage volumes
  - The same lifecycle

In my project, each Pod contains just one container (MySQL, Flask, or Nginx). But Kubernetes still wraps each container in a Pod.

A common multi-container pattern is a **sidecar** — for example, a log shipper alongside the main app. I did not need it here.

---

### Q4.4 — What is a Namespace?

**Answer:**

A **Namespace** is a virtual cluster inside a physical cluster. It is used to **isolate resources**.

In my project I created a namespace called `devtrack`. All resources (Deployments, Services, Secrets) live inside it. This is why every command includes `-n devtrack`.

Benefits:

- Logical separation (e.g. dev, staging, prod in same cluster)
- Easier cleanup — `kubectl delete namespace devtrack` deletes everything inside
- Access control per namespace

---

## 5. Kubernetes Deployments & Pods

### Q5.1 — What is a Deployment?

**Answer:**

A **Deployment** manages the desired state of a set of Pods. It ensures:

- A specified number of replicas (Pods) are always running
- Rolling updates when the image or configuration changes
- Automatic rollback if something goes wrong

In my project:
- `db` Deployment runs MySQL
- `web` Deployment runs Flask
- `nginx` Deployment runs Nginx

Each has `replicas: 1`, but I could scale up with `kubectl scale`.

---

### Q5.2 — What is the difference between a Deployment and a StatefulSet?

**Answer:**

| | Deployment | StatefulSet |
|---|---|---|
| Pod identity | Random names (`web-abc123`) | Stable names (`db-0`, `db-1`) |
| Storage | Shared or none | Per-pod PVCs |
| Order | Any order | Sequential |
| Use case | Stateless apps | Databases, queues |

For MySQL, production best practice is a **StatefulSet**. But for this learning project, a single-replica Deployment with `strategy: Recreate` was sufficient.

I chose Deployment + PVC because:
- Easier to understand for a first Kubernetes project
- MySQL runs fine with 1 replica
- `Recreate` strategy prevents old and new pods fighting over the same PVC

---

### Q5.3 — Why did you use `strategy: Recreate` for MySQL?

**Answer:**

By default, Kubernetes uses **RollingUpdate** strategy — it starts a new pod before terminating the old one.

But **MySQL cannot share a PVC with another MySQL process**. If two pods mount the same RWO PVC, one will fail.

`Recreate` strategy ensures:
1. Old pod is terminated first
2. Then new pod starts

Yes, this causes brief downtime. But it is **correct** for a database. There is no way to do a rolling update on a single-instance stateful app.

For production, you would use a StatefulSet with replication instead.

---

### Q5.4 — What is an initContainer? Why did you use it?

**Answer:**

An **initContainer** is a special container that runs **before** the main container starts. If it fails, the Pod is restarted. Once it succeeds, the main container starts.

I used it to replace Compose's `depends_on`:

```yaml
initContainers:
  - name: wait-for-mysql
    image: mysql:8.4
    command:
      - sh
      - -c
      - |
        until mysqladmin ping -h db -u root -p"$MYSQL_ROOT_PASSWORD" --silent; do
          echo "waiting for mysql..."; sleep 3;
        done
```

This polls MySQL every 3 seconds until it responds. Only then does Flask start.

**Why not just use a `sleep`?** — Sleeping a fixed amount is unreliable. `mysqladmin ping` actually checks if MySQL is accepting connections.

---

### Q5.5 — What happens if a Pod crashes in a Deployment?

**Answer:**

The Deployment's **ReplicaSet** notices that the desired number of pods is not met, and creates a new pod.

Kubernetes also handles:
- **Node failure** — pods on that node are rescheduled elsewhere
- **Container crash** — restart policy restarts the container inside the pod
- **OOM kill** — same as crash, container restarts

In my project, when I deleted the MySQL pod manually (`kubectl delete pod -l app=db`), Kubernetes immediately created a new one, and the PVC kept the data safe.

---

## 6. Kubernetes Services & Networking

### Q6.1 — What is a Service in Kubernetes?

**Answer:**

A **Service** is a stable network endpoint that exposes a set of Pods. Since Pod IPs change whenever pods restart, Services give you a **stable DNS name** and **load balance** traffic across pods.

In my project:
- `db` Service → exposes MySQL pods on port 3306
- `web` Service → exposes Flask pods on port 5000
- `nginx` Service → exposes Nginx pods on port 80

Other pods connect using the service name as the hostname (e.g. `db`, `web`).

---

### Q6.2 — What are the types of Services?

**Answer:**

| Type | Purpose |
|------|---------|
| **ClusterIP** | Only reachable inside the cluster (default) |
| **NodePort** | Exposes on every node's IP on a fixed port (30000-32767) |
| **LoadBalancer** | Cloud provider creates an external load balancer |
| **ExternalName** | Maps to an external DNS name |

In my project:
- `db` and `web` → **ClusterIP** (internal only)
- `nginx` → **NodePort** (30082) because it needs to be reachable from my browser

---

### Q6.3 — How do pods find each other in Kubernetes?

**Answer:**

Kubernetes has a built-in **DNS server (CoreDNS)**. Every Service gets a DNS name equal to its name inside the namespace.

So in my project:
- Flask connects to MySQL at hostname `db`
- Nginx proxies to Flask at hostname `web`

The full DNS is `<service-name>.<namespace>.svc.cluster.local`, but inside the same namespace, just the short name (`db`, `web`) works.

---

### Q6.4 — Why is NodePort 30082 used instead of 80?

**Answer:**

Two reasons:

1. **NodePort range** — Kubernetes allows NodePorts only in the range **30000–32767** by default. Port 80 is not allowed.
2. **Avoid conflict** — I chose 30082 to match the concept of port 8082 used in Docker Compose.

If I wanted port 80 externally, I would use an **Ingress** instead.

---

### Q6.5 — What is an Ingress?

**Answer:**

An **Ingress** is an HTTP/HTTPS routing rule that maps domains and paths to Services. It is more flexible than NodePort because:

- You can have multiple services on **port 80 / 443**
- You get host-based and path-based routing
- You can add TLS certificates easily

In Minikube, you enable it with:
```bash
minikube addons enable ingress
```

I did not use Ingress in this project to keep things simple, but it is a natural next step.

---

## 7. Kubernetes Storage (Volumes & PVC)

### Q7.1 — Why does a container need storage?

**Answer:**

By default, a container's filesystem is **ephemeral**. When the container is deleted, all data inside it is lost.

For MySQL, this is a disaster — every restart would lose all data. So we need **external storage** that survives container restarts.

In Docker Compose: **named volumes**.
In Kubernetes: **PersistentVolumes** and **PersistentVolumeClaims**.

---

### Q7.2 — What is a PVC? What is a PV?

**Answer:**

- **PersistentVolume (PV)** — an actual piece of storage in the cluster. It could be a cloud disk, NFS, or a local disk.
- **PersistentVolumeClaim (PVC)** — a **request** for storage by a pod. It asks for a size and access mode.

The cluster matches PVCs to PVs based on size and access mode. This is called **binding**.

In my project:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mysql-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

The MySQL Deployment mounts this PVC at `/var/lib/mysql`. Data survives pod restarts and even full Deployment deletion.

---

### Q7.3 — What does `ReadWriteOnce` mean?

**Answer:**

`ReadWriteOnce` (RWO) means the volume can be mounted **read-write by a single node at a time**.

Other options:
- `ReadOnlyMany` (ROX) — read-only on many nodes
- `ReadWriteMany` (RWX) — read-write on many nodes (requires special storage like NFS)

For MySQL, RWO is correct because MySQL should not be written to by multiple processes.

---

### Q7.4 — How did you prove data persistence?

**Answer:**

I ran this test:

```bash
# Add data through the UI, then delete the pod
kubectl delete pod -n devtrack -l app=db

# Wait for the new pod
kubectl get pods -n devtrack -w

# Check the data
kubectl exec -it -n devtrack deploy/db -- \
  mysql -u devuser -pdevpassword devops_tracker -e "SELECT * FROM learning_items;"
```

The data was still there. This proves the PVC is doing its job.

I even deleted the entire Deployment and re-applied it — same result. Data survives.

---

## 8. ConfigMaps & Secrets

### Q8.1 — What is a ConfigMap? What is a Secret?

**Answer:**

Both are ways to inject configuration into pods **without baking it into the image**.

- **ConfigMap** — for **non-sensitive** data (URLs, feature flags, database names)
- **Secret** — for **sensitive** data (passwords, API keys, TLS certificates)

Secrets are stored as base64-encoded strings (not encrypted by default — for real encryption you need to configure it).

In my project:

**ConfigMap (`db-config`):**
```yaml
data:
  DB_HOST: db
  DB_NAME: devops_tracker
```

**Secret (`db-secret`):**
```yaml
stringData:
  MYSQL_ROOT_PASSWORD: rootpassword
  MYSQL_USER: devuser
  MYSQL_PASSWORD: devpassword
```

---

### Q8.2 — How are they used in the pod?

**Answer:**

Two ways:

**1. As environment variables:**

```yaml
env:
  - name: DB_HOST
    valueFrom:
      configMapKeyRef:
        name: db-config
        key: DB_HOST
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-secret
        key: MYSQL_PASSWORD
```

**2. As mounted files:**

```yaml
volumes:
  - name: config-volume
    configMap:
      name: my-config
volumeMounts:
  - name: config-volume
    mountPath: /etc/config
```

In my project I used **environment variables** because it was simpler.

---

### Q8.3 — Are Kubernetes Secrets secure?

**Answer:**

Not by default. Secrets are:

- Stored in etcd
- Base64-encoded (NOT encrypted)

For real security you need to:

1. Enable **encryption at rest** in etcd
2. Use **RBAC** to restrict who can read secrets
3. Consider **external secret managers** (Vault, AWS Secrets Manager)
4. Use **sealed secrets** or **SOPS** for GitOps

In my project I used dummy values in the committed Secret file, and real values were only present locally. That is basic hygiene.

---

## 9. Health Probes & Lifecycle

### Q9.1 — What are readiness and liveness probes?

**Answer:**

- **Readiness probe** — tells Kubernetes whether the pod is **ready to receive traffic**. If it fails, the pod is removed from the Service endpoints (so no traffic goes to it).
- **Liveness probe** — tells Kubernetes whether the pod is **still alive**. If it fails repeatedly, Kubernetes **restarts** the container.

In my project:

**Flask** (readiness + liveness):
```yaml
readinessProbe:
  httpGet:
    path: /api/health
    port: 5000
livenessProbe:
  httpGet:
    path: /api/health
    port: 5000
```

**MySQL** (exec probes):
```yaml
readinessProbe:
  exec:
    command:
      - sh
      - -c
      - mysqladmin ping -h 127.0.0.1 -u root -p$MYSQL_ROOT_PASSWORD
```

---

### Q9.2 — What happens if the liveness probe fires too early?

**Answer:**

The container is killed — even if it is doing important work like initialising a database.

This is exactly what happened to me with MySQL. The liveness probe was killing MySQL during first-time initialisation, which left the PVC with partial data. The next restart then failed with:

```
InnoDB: Cannot create redo log files because data files are corrupt
```

**Fix:** I set `initialDelaySeconds: 60` and `periodSeconds: 15` on the MySQL liveness probe. This gave MySQL enough time to finish initialisation before the probe started checking.

**Lesson:** Liveness probes for databases should be **very lenient**. If unsure, delay more.

---

### Q9.3 — What is `initialDelaySeconds`?

**Answer:**

It is the number of seconds Kubernetes waits **before** it starts running the probe for the first time.

For slow-starting containers (like MySQL on first run), this needs to be generous.

Same idea with `periodSeconds` (how often to run the probe) and `failureThreshold` (how many failures before acting).

---

## 10. Resource Management

### Q10.1 — What are resource requests and limits?

**Answer:**

- **Requests** — the minimum amount of CPU/memory the container is guaranteed. Used by the scheduler to decide where to place pods.
- **Limits** — the maximum amount the container can use. If it exceeds memory limit, it is **OOM-killed**. If it exceeds CPU limit, it is **throttled**.

Example from my project:
```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

`m` = millicores (1000m = 1 CPU core).

---

### Q10.2 — Why did you set memory limits?

**Answer:**

Because without them, one misbehaving pod could consume all the node's memory and starve other pods.

My project has small workloads, so I set:

| Service | Limit |
|---------|-------|
| MySQL | 512Mi |
| Flask | 256Mi |
| Nginx | 128Mi |

MySQL gets more because it has caches and buffers. Nginx is very lightweight.

This mirrors the `mem_limit` I had in Docker Compose.

---

### Q10.3 — What happens if a pod exceeds its memory limit?

**Answer:**

Kubernetes **OOM-kills** the container (`OOM` = Out Of Memory). The pod is then restarted by its controller.

You can verify with:
```bash
kubectl describe pod <pod> -n devtrack
# Look for "Reason: OOMKilled"
```

If it happens often, you should:
1. Increase the memory limit
2. Investigate a memory leak in the app

---

## 11. Troubleshooting & Real Issues

### Q11.1 — What is `ImagePullBackOff`?

**Answer:**

Kubernetes could not pull the container image from the registry. Common causes:

1. Wrong image name or tag
2. Private registry without credentials
3. Network issue — Kubernetes cannot reach Docker Hub
4. Image does not exist

In my project, I hit this because Minikube's internal network could not reach Docker Hub reliably.

**Fix:** Pre-loaded the images using `minikube image load` and used `imagePullPolicy: IfNotPresent`.

---

### Q11.2 — What is `CrashLoopBackOff`?

**Answer:**

The container starts, crashes, and Kubernetes keeps restarting it. The "backoff" part means Kubernetes increases the delay between restarts (10s, 20s, 40s, etc.) to avoid hammering the system.

Debug with:
```bash
kubectl logs -n devtrack <pod> --previous    # Logs of the crashed instance
kubectl describe pod -n devtrack <pod>       # Events
```

In my project, MySQL was crashing due to corrupted InnoDB logs.

---

### Q11.3 — What is `CreateContainerConfigError`?

**Answer:**

Kubernetes could not create the container because something was missing from its configuration — usually a **Secret** or **ConfigMap** that the pod references.

In my project, I hit this because:
```
Error: secret "db-secret" not found
```

**Fix:** Applied the Secret YAML explicitly and confirmed the namespace was correct.

---

### Q11.4 — Tell me about a bug you debugged.

**Answer (STAR format):**

**Situation:** After migrating to Kubernetes, my MySQL pod kept entering `CrashLoopBackOff`.

**Task:** I needed to find out why and fix it without losing data.

**Action:**
1. Ran `kubectl logs -n devtrack deploy/db --previous --tail=50`
2. Saw the error: `InnoDB: Cannot create redo log files because data files are corrupt`
3. Understood the root cause — MySQL had been killed by the liveness probe during first-time initialisation, leaving partial files in the PVC.
4. Fixed it by:
   - Deleting the namespace to clear the corrupted PVC
   - Adding `securityContext.fsGroup: 999` so MySQL could write to the PVC
   - Increasing `livenessProbe.initialDelaySeconds` to 60
   - Adding `strategy: Recreate` so old and new pods do not fight over the same PVC

**Result:** MySQL started cleanly and data persisted correctly. I documented the whole thing in `ISSUES.md`.

---

## 12. Comparison: Docker Compose vs Kubernetes

### Q12.1 — What are the main differences?

**Answer:**

| Feature | Docker Compose | Kubernetes |
|---------|---------------|------------|
| Scope | Single host | Multi-node cluster |
| Scaling | Manual (`--scale`) | Automatic (HPA) |
| Self-healing | Limited | Full — auto-restarts, reschedules |
| Service discovery | Simple DNS | Full DNS + load balancing |
| Config | `.env` file | ConfigMap + Secret |
| Storage | Named volumes | PV + PVC |
| Health checks | `healthcheck:` | `readinessProbe` + `livenessProbe` |
| Port exposure | `ports:` mapping | ClusterIP / NodePort / Ingress |
| Learning curve | Low | Medium-high |
| Production use | Small apps, dev | Standard for large apps |

For a **3-tier app on one machine**, Compose is fine. For **production with multiple nodes**, Kubernetes is necessary.

---

### Q12.2 — Why did you migrate from Compose to Kubernetes?

**Answer:**

To learn **production-grade orchestration**. Docker Compose works great for a single host, but real production environments need:

- **Self-healing** — restarting failed pods automatically
- **Scaling** — running more replicas under load
- **Rolling updates** — deploying new versions without downtime
- **Declarative config** — describing desired state instead of commands
- **Multi-node** — running across many machines
- **Resource management** — CPU and memory quotas

Kubernetes gives all of these. Compose does not.

---

## 13. Real-World & Scenario Questions

### Q13.1 — What if you need to scale the Flask backend?

**Answer:**

Since Flask is stateless (it does not hold session data in memory), I can scale it easily:

```bash
kubectl scale deployment web -n devtrack --replicas=5
```

Kubernetes will start 4 more pods. The `web` Service automatically load-balances traffic across them.

For **automatic** scaling based on CPU usage, I would use a **HorizontalPodAutoscaler**:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
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

I could not scale MySQL the same way because it is stateful — MySQL replication needs special handling.

---

### Q13.2 — How would you handle zero-downtime deployment?

**Answer:**

For the **Flask** service, Kubernetes does this automatically with RollingUpdate:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

This means:
- Start a new pod first (`maxSurge: 1`)
- Wait for it to be Ready
- Then kill an old pod (`maxUnavailable: 0`)

Since the `web` service load-balances across both old and new pods during the transition, there is **no downtime**.

For **MySQL**, zero-downtime is much harder because it is stateful. In production, you would use:
- A StatefulSet with master-slave replication
- Or a managed database (RDS, Cloud SQL)

In my project, MySQL uses `Recreate` strategy — small downtime accepted.

---

### Q13.3 — How would you add HTTPS?

**Answer:**

I would add an **Ingress** with a TLS certificate. Steps:

1. Enable ingress in Minikube:
   ```bash
   minikube addons enable ingress
   ```

2. Create a TLS Secret:
   ```bash
   kubectl create secret tls my-tls-secret --cert=tls.crt --key=tls.key -n devtrack
   ```

3. Add Ingress YAML:
   ```yaml
   apiVersion: networking.k8s.io/v1
   kind: Ingress
   metadata:
     name: devtrack-ingress
     namespace: devtrack
   spec:
     tls:
       - hosts:
           - devtrack.local
         secretName: my-tls-secret
     rules:
       - host: devtrack.local
         http:
           paths:
             - path: /
               pathType: Prefix
               backend:
                 service:
                   name: nginx
                   port:
                     number: 80
   ```

For production, I would use **cert-manager** to auto-provision Let's Encrypt certificates.

---

### Q13.4 — How would you set up CI/CD for this?

**Answer:**

I would use **GitHub Actions** with these steps:

1. **On every push** to `main`:
   - Build the backend and nginx images
   - Tag with the commit SHA
   - Push to Docker Hub

2. **On release tag** (`v1.0.0`):
   - Update the Kubernetes manifests with the new tag
   - Apply to the cluster (`kubectl apply -f k8s/`)
   - Verify with `kubectl rollout status`

Example workflow (simplified):
```yaml
name: Build and Deploy
on:
  push:
    branches: [main]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - run: |
          docker build -t hritikranjan1/devops-learning-tracker-backend:${{ github.sha }} ./backend
          docker push hritikranjan1/devops-learning-tracker-backend:${{ github.sha }}
  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          kubectl set image deployment/web -n devtrack web=hritikranjan1/devops-learning-tracker-backend:${{ github.sha }}
          kubectl rollout status deployment/web -n devtrack
```

For real clusters, I would store the kubeconfig as an encrypted secret.

---

## 14. Behavioural Questions

### Q14.1 — Tell me about a time you had to debug a complex issue.

**Answer:** See Q11.4 — the MySQL `CrashLoopBackOff` story. Walk through Situation → Task → Action → Result.

---

### Q14.2 — What did you learn from this project?

**Answer:**

Three big things:

1. **Docker is simple; Kubernetes is powerful but has sharp edges.** Compose hides many details that Kubernetes exposes. For example, Compose automatically waits for services — Kubernetes does not, so I had to learn `initContainers`.

2. **Stateful workloads are hard.** MySQL on Kubernetes is very different from a stateless web app. I had to think about PVC permissions (`fsGroup`), probe timing, and startup strategy (`Recreate`).

3. **Documentation matters.** Writing `ISSUES.md` forced me to really understand the root causes. It is now my best reference for future projects.

---

### Q14.3 — If you had more time, what would you improve?

**Answer:**

Four things:

1. **Ingress + TLS** — cleaner URLs and HTTPS.
2. **Helm chart** — package the entire stack into a reusable chart.
3. **HPA** — auto-scale the backend based on CPU.
4. **Monitoring** — Prometheus + Grafana for metrics and alerts.
5. **StatefulSet for MySQL** — production-grade database with replication.

---

### Q14.4 — Where do you see yourself using these skills?

**Answer:**

These skills are used daily in roles like:

- **DevOps Engineer** — running CI/CD, managing clusters
- **Platform Engineer** — building internal developer platforms
- **SRE** — reliability, scaling, incident response
- **Cloud Engineer** — deploying workloads on AWS/GCP/Azure (EKS, GKE, AKS)
- **Backend Engineer** — understanding deployment helps write better code

Kubernetes is one of the most in-demand skills right now, and I want to keep building on this foundation.

---

## 📚 Extra Resources

If you want to go deeper:

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Minikube Handbook](https://minikube.sigs.k8s.io/docs/)
- [Kubernetes the Hard Way](https://github.com/kelseyhightower/kubernetes-the-hard-way)

---

## 👨‍💻 Author

**Hritik Ranjan**
DevOps & Cloud Learner

- GitHub: https://github.com/hritikranjan1
- LinkedIn: https://www.linkedin.com/in/hritikranjan1/
- Blog: https://blogs.hritikranjan.in
- Website: https://hritikranjan.in

---

**All the best for your interview! 🚀**