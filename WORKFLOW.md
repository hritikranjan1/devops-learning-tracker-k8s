# 📖 Complete Kubernetes Workflow — How Everything Connects

This document explains **what happens behind the scenes** when you deploy this project on Kubernetes.

Instead of just showing commands, it explains **why** each Kubernetes resource exists, **what problem it solves**, and **in what order** things happen.

If you have ever wondered "why do I need 10 YAML files?", this guide is for you.

---

## 📑 Table of Contents

1. [The Big Picture](#1-the-big-picture)
2. [Why Order Matters](#2-why-order-matters)
3. [The Complete Workflow — Visual](#3-the-complete-workflow--visual)
4. [Step-by-Step Workflow](#4-step-by-step-workflow)
   - [Step 1 — Namespace](#step-1--namespace)
   - [Step 2 — Secret](#step-2--secret)
   - [Step 3 — ConfigMap](#step-3--configmap)
   - [Step 4 — PersistentVolumeClaim](#step-4--persistentvolumeclaim)
   - [Step 5 — MySQL Deployment](#step-5--mysql-deployment)
   - [Step 6 — MySQL Service](#step-6--mysql-service)
   - [Step 7 — Backend Deployment](#step-7--backend-deployment)
   - [Step 8 — Backend Service](#step-8--backend-service)
   - [Step 9 — Nginx Deployment](#step-9--nginx-deployment)
   - [Step 10 — Nginx Service (NodePort)](#step-10--nginx-service-nodeport)
5. [What Happens When You Run `kubectl apply -f k8s/`](#5-what-happens-when-you-run-kubectl-apply--f-k8s)
6. [What Happens When a Pod Starts](#6-what-happens-when-a-pod-starts)
7. [What Happens When a User Opens the App](#7-what-happens-when-a-user-opens-the-app)
8. [What Happens When a Pod Crashes](#8-what-happens-when-a-pod-crashes)
9. [Why This Order? (Summary Table)](#9-why-this-order-summary-table)
10. [Common Mistakes and Why They Fail](#10-common-mistakes-and-why-they-fail)
11. [Resources Used — Cheat Sheet](#11-resources-used--cheat-sheet)

---

## 1. The Big Picture

Kubernetes is a **declarative** system. You do **not** tell it "start this container now" — you tell it "I want this state to exist". Kubernetes works endlessly to make reality match your desired state.

```text
    YOU                     KUBERNETES                  REALITY
 ┌───────┐              ┌──────────────┐           ┌──────────────┐
 │ Write │ ───apply──►  │ desired state│  ──────►  │ actual state │
 │ YAML  │              │ (in etcd)    │           │ (in cluster) │
 └───────┘              └──────────────┘           └──────────────┘
                                ▲                        │
                                │                        │
                                └──── watches ───────────┘
                                   and reconciles
```

Every Kubernetes resource has a **controller** (a small program) that watches the desired state and tries to make reality match.

For example:

- You create a **Deployment** with `replicas: 3`
- The Deployment's controller sees only 2 pods running
- It creates 1 more pod

You do not have to tell it to. It just does it.

---

## 2. Why Order Matters

Some resources depend on others:

- A **Pod** cannot start if it needs a **Secret** that does not exist.
- A **Service** has no endpoints if the pods it selects do not exist.
- A **Deployment** that uses a **PVC** cannot start if the PVC is not bound to a PV.

That is why the YAML files are numbered `00-`, `01-`, `02-` — so they can be applied in a safe order.

That said, `kubectl apply -f k8s/` does **not** strictly apply them in filename order unless you pass `--sort-by=metadata.name` or apply them individually. But the naming makes the intent obvious and safe.

---

## 3. The Complete Workflow — Visual

Here is the entire flow from an empty cluster to a running app:

```text
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 1 — FOUNDATION                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ①  Namespace (devtrack)                                          │
│       └── A box to hold everything                                  │
│                                                                     │
│   ②  Secret (db-secret)                                            │
│       └── Passwords for MySQL                                       │
│                                                                     │
│   ③  ConfigMap (db-config)                                         │
│       └── Non-secret config (DB host, DB name)                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 2 — STORAGE                                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ④  PersistentVolumeClaim (mysql-pvc)                             │
│       └── "I need 1Gi of storage" → K8s binds a PV                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 3 — DATABASE LAYER                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ⑤  MySQL Deployment                                              │
│       └── A pod running mysql:8.4                                   │
│           └── Uses: Secret, ConfigMap, PVC                          │
│                                                                     │
│   ⑥  MySQL Service (ClusterIP)                                     │
│       └── Stable DNS name "db" on port 3306                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 4 — BACKEND LAYER                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ⑦  Flask Deployment                                              │
│       └── A pod running the backend image                           │
│           ├── Uses: Secret, ConfigMap (DB credentials)              │
│           ├── initContainer waits for MySQL                        │
│           └── Talks to MySQL via hostname "db"                     │
│                                                                     │
│   ⑧  Flask Service (ClusterIP)                                     │
│       └── Stable DNS name "web" on port 5000                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 5 — FRONTEND LAYER                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ⑨  Nginx Deployment                                              │
│       └── A pod serving the frontend + proxying /api → "web"        │
│                                                                     │
│   ⑩  Nginx Service (NodePort 30082)                                │
│       └── Exposes the app to your browser                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  🌐 http://minikube │
                    │     :30082          │
                    └─────────────────────┘
```

---

## 4. Step-by-Step Workflow

Below is a detailed explanation of each resource: **what it is**, **why we need it**, **what problem it solves**, and **the exact YAML**.

---

### Step 1 — Namespace

#### 🔹 What it is

A **Namespace** is a virtual partition inside a cluster. Resources in one namespace are isolated from another namespace by default.

#### 🔹 Why we need it

Without a namespace, every resource goes into the `default` namespace. In a shared cluster that is messy and dangerous. With a namespace:

- Everything for this project lives in one logical place
- We can delete everything with one command
- We can apply RBAC (permissions) at the namespace level
- Different teams can use different namespaces in the same cluster

#### 🔹 File — `k8s/00-namespace.yaml`

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: devtrack
```

#### 🔹 Apply

```bash
kubectl apply -f k8s/00-namespace.yaml
```

#### 🔹 Verify

```bash
kubectl get namespaces
kubectl get ns devtrack
```

You should see `devtrack` in the list.

**Every other command from now on will use `-n devtrack`.**

---

### Step 2 — Secret

#### 🔹 What it is

A **Secret** stores sensitive data — passwords, API keys, TLS certificates.

#### 🔹 Why we need it

MySQL needs a root password, a user password, a database name, and a username. If we hardcode these in the Deployment YAML:

- They end up in git (bad!)
- They are visible in `kubectl describe pod`
- Anyone with read access to the Deployment can see them

With a Secret:

- Passwords are stored separately
- You can rotate them without changing the Deployment
- You can control who can read them using RBAC

> ⚠️ Kubernetes Secrets are **base64-encoded**, not encrypted, by default. For production, use external secret managers or enable etcd encryption.

#### 🔹 File — `k8s/01-secret.yaml`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
  namespace: devtrack
type: Opaque
stringData:
  MYSQL_ROOT_PASSWORD: rootpassword
  MYSQL_DATABASE: devops_tracker
  MYSQL_USER: devuser
  MYSQL_PASSWORD: devpassword
```

> Notice `stringData` — this lets you write plain text and Kubernetes base64-encodes it automatically. You could also use `data` with base64 values manually.

#### 🔹 Apply

```bash
kubectl apply -f k8s/01-secret.yaml
```

#### 🔹 Verify

```bash
kubectl get secret -n devtrack
kubectl describe secret db-secret -n devtrack
```

You should see 4 keys, but no values (Kubernetes hides them from `describe`).

To actually see the values:

```bash
kubectl get secret db-secret -n devtrack -o jsonpath='{.data.MYSQL_USER}' | base64 -d
```

---

### Step 3 — ConfigMap

#### 🔹 What it is

A **ConfigMap** stores non-sensitive configuration data as key-value pairs.

#### 🔹 Why we need it

Some configuration is not sensitive but still should not be baked into the container image:

- `DB_HOST=db` — the name of the MySQL service
- `DB_NAME=devops_tracker` — the database name

If we hardcode these:

- Changing the value requires rebuilding the image
- The same image cannot be used in different environments (dev, prod)

With a ConfigMap:

- Configuration is separate from the image
- The same image can be used everywhere
- You can change config and restart the pod

#### 🔹 File — `k8s/02-configmap.yaml`

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: db-config
  namespace: devtrack
data:
  DB_HOST: db
  DB_NAME: devops_tracker
```

#### 🔹 Apply

```bash
kubectl apply -f k8s/02-configmap.yaml
```

#### 🔹 Verify

```bash
kubectl get configmap -n devtrack
kubectl describe configmap db-config -n devtrack
```

---

### Step 4 — PersistentVolumeClaim

#### 🔹 What it is

A **PersistentVolumeClaim (PVC)** is a request for storage. It asks the cluster: "Give me X GB of storage with Y access mode."

Kubernetes then finds (or creates) a **PersistentVolume (PV)** that satisfies the request and **binds** them together.

#### 🔹 Why we need it

Without a PVC:

- MySQL stores its data inside the container
- When the pod is deleted, the data is lost
- Every restart means starting from scratch

With a PVC:

- Data is stored on a real disk (or a cloud volume)
- Pod can be deleted and recreated
- Data survives restarts, deployments and even node failures

> **ReadWriteOnce** means only one pod on one node can mount it read-write at a time. That is perfect for MySQL, which should never be written to from multiple processes.

#### 🔹 File — `k8s/03-mysql-pvc.yaml`

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mysql-pvc
  namespace: devtrack
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

#### 🔹 Apply

```bash
kubectl apply -f k8s/03-mysql-pvc.yaml
```

#### 🔹 Verify

```bash
kubectl get pvc -n devtrack
```

Expected:
```
NAME        STATUS   VOLUME    CAPACITY   ACCESS MODES
mysql-pvc   Bound    pvc-xxx   1Gi        RWO
```

**`Bound` means it succeeded.** If it says `Pending`, no PV matched — check your cluster's StorageClass.

---

### Step 5 — MySQL Deployment

#### 🔹 What it is

A **Deployment** is a controller that ensures a specific number of identical Pods are always running. It handles restarts, updates and rollbacks.

#### 🔹 Why we need it

Without a Deployment:

- If the pod crashes, no one restarts it
- No way to update the container image safely
- No scaling

With a Deployment:

- It ensures 1 MySQL pod is always running
- If the pod crashes, it starts a new one
- `Recreate` strategy ensures only one MySQL runs at a time (important for PVC)

#### 🔹 Why `strategy: Recreate`?

By default, a Deployment uses RollingUpdate, which starts a new pod **before** killing the old one. But:

- The new MySQL pod cannot mount the PVC while the old one is still using it
- Only one MySQL process can write to a PVC at a time

`Recreate` strategy kills the old pod first, then starts the new one. Brief downtime, but **correct**.

#### 🔹 Why `securityContext.fsGroup: 999`?

MySQL's image runs as user `mysql` (UID 999). But PVCs are usually mounted as `root:root`. Without `fsGroup`, MySQL cannot write to the volume and crashes with **permission denied**.

`fsGroup: 999` tells Kubernetes to change the group ownership of the volume to GID 999.

#### 🔹 Why `livenessProbe.initialDelaySeconds: 60`?

MySQL takes 30–60 seconds to initialize on first start. If the liveness probe fires too early, it kills the pod mid-initialization — leaving the PVC corrupted.

60 seconds is a safety margin.

#### 🔹 File — `k8s/04-mysql-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: db
  namespace: devtrack
spec:
  replicas: 1
  selector:
    matchLabels:
      app: db
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: db
    spec:
      securityContext:
        fsGroup: 999
      containers:
        - name: mysql
          image: mysql:8.4
          ports:
            - containerPort: 3306
          env:
            - name: MYSQL_ROOT_PASSWORD
              valueFrom:
                secretKeyRef: { name: db-secret, key: MYSQL_ROOT_PASSWORD }
            - name: MYSQL_DATABASE
              valueFrom:
                secretKeyRef: { name: db-secret, key: MYSQL_DATABASE }
            - name: MYSQL_USER
              valueFrom:
                secretKeyRef: { name: db-secret, key: MYSQL_USER }
            - name: MYSQL_PASSWORD
              valueFrom:
                secretKeyRef: { name: db-secret, key: MYSQL_PASSWORD }
          volumeMounts:
            - name: mysql-data
              mountPath: /var/lib/mysql
          resources:
            limits:
              memory: "512Mi"
              cpu: "500m"
            requests:
              memory: "256Mi"
              cpu: "250m"
          readinessProbe:
            exec:
              command:
                - sh
                - -c
                - mysqladmin ping -h 127.0.0.1 -u root -p$MYSQL_ROOT_PASSWORD
            initialDelaySeconds: 30
            periodSeconds: 5
          livenessProbe:
            exec:
              command:
                - sh
                - -c
                - mysqladmin ping -h 127.0.0.1 -u root -p$MYSQL_ROOT_PASSWORD
            initialDelaySeconds: 60
            periodSeconds: 15
      volumes:
        - name: mysql-data
          persistentVolumeClaim:
            claimName: mysql-pvc
```

#### 🔹 Apply

```bash
kubectl apply -f k8s/04-mysql-deployment.yaml
```

#### 🔹 Verify

```bash
kubectl get deployment -n devtrack
kubectl get pods -n devtrack -l app=db -w
```

Wait until the pod shows `1/1 Running`. Press `Ctrl+C`.

#### 🔹 What if it fails?

```bash
kubectl describe pod -n devtrack -l app=db
kubectl logs -n devtrack -l app=db --previous
```

Most common causes: PVC permission, corrupted data, missing Secret.

---

### Step 6 — MySQL Service

#### 🔹 What it is

A **Service** is a stable network endpoint in front of a set of Pods.

#### 🔹 Why we need it

Pod IPs are **ephemeral** — every time a pod restarts, it gets a new IP. If the Flask backend hardcoded a pod IP, it would break on every MySQL restart.

With a Service:

- The Service has a stable IP (ClusterIP)
- The Service has a stable DNS name (`db`)
- Traffic is automatically routed to whatever pods match the label selector

So Flask just connects to `db:3306` and never worries about the underlying pod IP.

#### 🔹 Type: ClusterIP

MySQL should **not** be reachable from outside the cluster. ClusterIP keeps it internal.

#### 🔹 File — `k8s/05-mysql-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: db
  namespace: devtrack
spec:
  selector:
    app: db
  ports:
    - port: 3306
      targetPort: 3306
  type: ClusterIP
```

#### 🔹 Apply

```bash
kubectl apply -f k8s/05-mysql-service.yaml
```

#### 🔹 Verify

```bash
kubectl get svc -n devtrack
kubectl get endpoints db -n devtrack
```

Endpoints should show the MySQL pod's IP:3306. If it is empty, the pod's labels do not match the Service selector.

---

### Step 7 — Backend Deployment (Flask)

#### 🔹 What it is

A Deployment for the Flask backend.

#### 🔹 Why `initContainer`?

Docker Compose has `depends_on: condition: service_healthy`. Kubernetes does **not** have that.

Instead, we use an `initContainer` that polls MySQL with `mysqladmin ping` until it responds.

Only after the initContainer succeeds does the main Flask container start.

This replaces `depends_on`.

#### 🔹 Why env vars from ConfigMap and Secret?

The Flask app needs to know **where** MySQL is (`db`), **which** database to use (`devops_tracker`), and **what** credentials to use (from the Secret).

Pulling these from ConfigMap and Secret lets us change configuration without rebuilding the image.

#### 🔹 File — `k8s/06-backend-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: devtrack
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
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
          env:
            - name: MYSQL_ROOT_PASSWORD
              valueFrom:
                secretKeyRef: { name: db-secret, key: MYSQL_ROOT_PASSWORD }
      containers:
        - name: web
          image: hritikranjan1/devops-learning-tracker-backend:1.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 5000
          env:
            - name: DB_HOST
              valueFrom:
                configMapKeyRef: { name: db-config, key: DB_HOST }
            - name: DB_NAME
              valueFrom:
                configMapKeyRef: { name: db-config, key: DB_NAME }
            - name: DB_USER
              valueFrom:
                secretKeyRef: { name: db-secret, key: MYSQL_USER }
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef: { name: db-secret, key: MYSQL_PASSWORD }
          resources:
            limits:
              memory: "256Mi"
              cpu: "300m"
            requests:
              memory: "128Mi"
              cpu: "100m"
          readinessProbe:
            httpGet:
              path: /api/health
              port: 5000
            initialDelaySeconds: 15
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /api/health
              port: 5000
            initialDelaySeconds: 40
            periodSeconds: 15
```

#### 🔹 Apply

```bash
kubectl apply -f k8s/06-backend-deployment.yaml
```

#### 🔹 Verify

```bash
kubectl get pods -n devtrack -l app=web -w
kubectl logs -n devtrack -l app=web -c wait-for-mysql
```

The initContainer log will show:
```
waiting for mysql...
waiting for mysql...
(until MySQL responds, then exit 0)
```

Then the main container starts.

---

### Step 8 — Backend Service

Same idea as the MySQL Service — a stable DNS name `web` on port 5000 for Nginx to connect to.

#### 🔹 File — `k8s/07-backend-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: devtrack
spec:
  selector:
    app: web
  ports:
    - port: 5000
      targetPort: 5000
  type: ClusterIP
```

#### 🔹 Apply

```bash
kubectl apply -f k8s/07-backend-service.yaml
```

#### 🔹 Verify

```bash
kubectl get svc web -n devtrack
kubectl get endpoints web -n devtrack
```

---

### Step 9 — Nginx Deployment

#### 🔹 What it is

A Deployment for the Nginx container, which:

- Serves the frontend (HTML/CSS/JS)
- Proxies `/api/*` requests to the Flask backend

#### 🔹 Why Nginx?

Three reasons:

1. **Static file serving** — Nginx is much faster at serving static files than Flask.
2. **Reverse proxy** — Nginx hides the backend from the outside world. Only Nginx is exposed.
3. **Single entry point** — You only need to expose one Service (Nginx), not the backend.

#### 🔹 File — `k8s/08-nginx-deployment.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: devtrack
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: hritikranjan1/devops-learning-tracker-nginx:1.0
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
          resources:
            limits:
              memory: "128Mi"
              cpu: "200m"
            requests:
              memory: "64Mi"
              cpu: "100m"
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 5
            periodSeconds: 5
```

#### 🔹 Apply

```bash
kubectl apply -f k8s/08-nginx-deployment.yaml
```

---

### Step 10 — Nginx Service (NodePort)

#### 🔹 What it is

A Service of type **NodePort** exposes the application on every node's IP on a specific port (30082 in our case).

#### 🔹 Why NodePort?

ClusterIP services are only reachable from inside the cluster. We need a way to reach the app from our **browser**, which is **outside** the cluster.

Options:

- **NodePort** — exposes on each node at a port. Simple. What we used.
- **LoadBalancer** — creates a cloud load balancer. Needs cloud provider.
- **Ingress** — HTTP routing based on hostname. More powerful. Not used here to keep it simple.

For local Minikube, NodePort is the simplest option.

#### 🔹 File — `k8s/09-nginx-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx
  namespace: devtrack
spec:
  selector:
    app: nginx
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30082
  type: NodePort
```

#### 🔹 Apply

```bash
kubectl apply -f k8s/09-nginx-service.yaml
```

#### 🔹 Verify

```bash
kubectl get svc nginx -n devtrack
minikube service nginx -n devtrack
```

Browser opens at `http://<minikube-ip>:30082`.

---

## 5. What Happens When You Run `kubectl apply -f k8s/`

Here is the actual flow inside Kubernetes when you apply the YAMLs:

```text
 ┌───────────────────────┐
 │  kubectl apply        │
 │  -f k8s/              │
 └──────────┬────────────┘
            │
            ▼
 ┌───────────────────────┐
 │  kubectl sends the    │
 │  YAML to the          │
 │  Kubernetes API       │
 └──────────┬────────────┘
            │
            ▼
 ┌───────────────────────┐
 │  API Server validates │
 │  and stores in etcd   │
 └──────────┬────────────┘
            │
            ▼
 ┌───────────────────────────────────────────────┐
 │  Controllers wake up and reconcile            │
 ├───────────────────────────────────────────────┤
 │                                                │
 │  Namespace controller     → creates the NS    │
 │  Secret/ConfigMap         → stored in etcd    │
 │  PVC controller           → binds a PV        │
 │  Deployment controller    → creates ReplicaSet│
 │  ReplicaSet controller    → creates Pods      │
 │  Scheduler                → assigns pods to   │
 │                             nodes             │
 │  Kubelet (on node)        → starts containers │
 │  Service controller       → creates endpoints │
 │  CoreDNS                  → registers DNS     │
 │                                                │
 └───────────────────────────────────────────────┘
```

You do not have to do anything else. Kubernetes keeps working until the desired state matches reality.

---

## 6. What Happens When a Pod Starts

When a pod starts (for example, the `web` pod), this is the exact sequence:

```text
 ┌─────────────────────────────────────┐
 │  1. Pod is scheduled to a node      │
 └─────────────────┬───────────────────┘
                   ▼
 ┌─────────────────────────────────────┐
 │  2. Kubelet pulls the image         │
 │     (or uses local cache)           │
 └─────────────────┬───────────────────┘
                   ▼
 ┌─────────────────────────────────────┐
 │  3. Init containers run             │
 │     (wait-for-mysql)                │
 │     until they exit 0               │
 └─────────────────┬───────────────────┘
                   ▼
 ┌─────────────────────────────────────┐
 │  4. Main container starts           │
 │     (Flask starts on port 5000)     │
 └─────────────────┬───────────────────┘
                   ▼
 ┌─────────────────────────────────────┐
 │  5. readinessProbe runs             │
 │     → GET /api/health               │
 │     until it returns 200            │
 └─────────────────┬───────────────────┘
                   ▼
 ┌─────────────────────────────────────┐
 │  6. Pod marked "Ready"              │
 │     → added to Service endpoints    │
 │     → now receives traffic          │
 └─────────────────┬───────────────────┘
                   ▼
 ┌─────────────────────────────────────┐
 │  7. livenessProbe runs periodically │
 │     → restarts container if failed  │
 └─────────────────────────────────────┘
```

**Key insight:** A pod is not "in service" until its readiness probe passes. That is why users never hit a half-started pod.

---

## 7. What Happens When a User Opens the App

When you open `http://192.168.49.2:30082` in your browser:

```text
 1. Browser sends HTTP request to 192.168.49.2:30082
        │
        ▼
 2. Minikube node receives the request on port 30082
        │
        ▼
 3. NodePort Service (nginx) matches the request
        │
        ▼
 4. Service forwards it to one of the nginx pods
        │
        ▼
 5. Nginx pod serves the static frontend (index.html, style.css, script.js)
        │
        ▼
 6. Browser renders the UI
        │
        ▼
 7. Browser makes AJAX call to /api/learning
        │
        ▼
 8. Nginx receives /api/learning, matches the /api/ location
        │
        ▼
 9. Nginx proxies the request to http://web:5000/api/learning
        │
        ▼
 10. Service "web" resolves "web" → pod IP:5000
        │
        ▼
 11. Flask receives the request
        │
        ▼
 12. Flask connects to MySQL at hostname "db" port 3306
        │
        ▼
 13. Service "db" resolves to MySQL pod IP
        │
        ▼
 14. MySQL queries learning_items table
        │
        ▼
 15. Response flows back: MySQL → Flask → Nginx → Browser
```

The user sees data. Under the hood, **three Services**, **three Pods**, **DNS**, **ClusterIPs** and **a proxy** were involved.

---

## 8. What Happens When a Pod Crashes

Say the `web` pod crashes:

```text
 1. Kubelet sees the container exit
        │
        ▼
 2. The pod is marked "Not Ready"
        │
        ▼
 3. Service "web" removes the pod's IP from its endpoints
        │
        ▼
 4. Traffic no longer goes to this pod
        │
        ▼
 5. ReplicaSet controller notices only 0/1 pods are running
        │
        ▼
 6. ReplicaSet creates a new pod
        │
        ▼
 7. New pod starts, waits for MySQL via initContainer
        │
        ▼
 8. readinessProbe passes → pod added to Service endpoints
        │
        ▼
 9. Traffic resumes → zero downtime for users
```

This is **self-healing** in action. You do not have to do anything.

---

## 9. Why This Order? (Summary Table)

| # | Resource | Why this position |
|---|----------|-------------------|
| 1 | Namespace | Everything else goes inside it |
| 2 | Secret | Needed by MySQL and Flask Deployments |
| 3 | ConfigMap | Needed by Flask Deployment |
| 4 | PVC | Needed by MySQL Deployment |
| 5 | MySQL Deployment | Depends on Secret and PVC |
| 6 | MySQL Service | Depends on MySQL Deployment (for endpoints) |
| 7 | Flask Deployment | Depends on MySQL Service (initContainer) |
| 8 | Flask Service | Depends on Flask Deployment |
| 9 | Nginx Deployment | Depends on Flask Service (proxy_pass) |
| 10 | Nginx Service | Depends on Nginx Deployment |

If you apply out of order, Kubernetes will still eventually catch up — but the Deployments will show errors until their dependencies appear.

---

## 10. Common Mistakes and Why They Fail

### ❌ Forgetting the Secret

Pod events will show:
```
Error: secret "db-secret" not found
```

**Fix:** Apply `01-secret.yaml` before `04-mysql-deployment.yaml`.

---

### ❌ Using `Recreate` strategy but shared PVC across replicas

If you set `replicas: 2` on MySQL with RWO PVC, the second pod cannot mount the volume.

**Fix:** Keep `replicas: 1` for MySQL. For production, use a StatefulSet with per-pod PVCs.

---

### ❌ Missing `fsGroup: 999`

MySQL crashes with:
```
mysqld: Can't create/write to file ... Permission denied
```

**Fix:** Add `securityContext.fsGroup: 999` at the pod level.

---

### ❌ Liveness probe too aggressive

MySQL is killed during initialization → PVC becomes corrupted.

**Fix:** Increase `initialDelaySeconds` to 60 and `periodSeconds` to 15.

---

### ❌ Service selector mismatch

Endpoints show `<none>`, Service does not work.

**Fix:** Ensure Service `selector` matches Pod labels exactly.

```yaml
# Deployment
labels:
  app: web

# Service
selector:
  app: web
```

---

### ❌ Wrong DB_HOST

Flask cannot find the database.

**Fix:** Use the Service **name**, not the deployment name or pod name. In our case, `DB_HOST: db`.

---

## 11. Resources Used — Cheat Sheet

| Resource | Name | Purpose |
|----------|------|---------|
| Namespace | `devtrack` | Isolate all project resources |
| Secret | `db-secret` | Store DB passwords |
| ConfigMap | `db-config` | Store DB host and name |
| PVC | `mysql-pvc` | Persistent storage for MySQL |
| Deployment | `db` | Run MySQL |
| Deployment | `web` | Run Flask backend |
| Deployment | `nginx` | Run Nginx frontend/proxy |
| Service | `db` | Stable name for MySQL |
| Service | `web` | Stable name for Flask |
| Service | `nginx` | Expose app to browser (NodePort 30082) |

---

## 👨‍💻 Author

**Hritik Ranjan**
DevOps & Cloud Learner

- GitHub: https://github.com/hritikranjan1
- LinkedIn: https://www.linkedin.com/in/hritikranjan1/
- Blog: https://blogs.hritikranjan.in
- Website: https://hritikranjan.in

---

**Read this file end-to-end once. After that, you will understand every single YAML in this project. 🚀**