# 🐛 Issues Faced During the Project — Complete Troubleshooting Log

This document lists every significant issue I faced while building and deploying the **DevOps Learning Tracker** project — both on **Docker Compose** and on **Kubernetes (Minikube)**.

For each issue I have written:

1. **What happened** — the symptom I saw
2. **Why it happened** — the root cause
3. **How I fixed it** — the exact steps and commands
4. **What I learned** — the takeaway

Everything is written in simple language so it can also be used as a learning reference.

---

## 📚 Table of Contents

- [Part 1 — Docker Compose Issues](#part-1--docker-compose-issues)
- [Part 2 — Image Build & Docker Hub Issues](#part-2--image-build--docker-hub-issues)
- [Part 3 — Kubernetes Migration Issues](#part-3--kubernetes-migration-issues)
- [Part 4 — MySQL on Kubernetes Issues](#part-4--mysql-on-kubernetes-issues)
- [Part 5 — Networking & Nginx Issues](#part-5--networking--nginx-issues)
- [Key Takeaways](#-key-takeaways)

---

## Part 1 — Docker Compose Issues

### 🔴 Issue 1: Flask build failed — wrong build context

**What happened:**
When I ran `docker compose up -d --build`, the backend service failed to build. Docker could not find the files it needed.

**Why it happened:**
In my initial `docker-compose.yml`, the Flask service was configured with the wrong `build` context. The `context` was pointing to the project root instead of the `./backend` folder. So Docker was looking for `Dockerfile` and `app.py` in the wrong place.

**How I fixed it:**
I changed the `build` section for the `web` service to point to the correct folder:

```yaml
web:
  build:
    context: ./backend
    dockerfile: Dockerfile
```

After that, the Flask image built successfully.

**What I learned:**
`build.context` is the folder Docker sends to the daemon. It must contain the `Dockerfile` and all files referenced inside it. Always double-check relative paths from the compose file's location.

---

### 🔴 Issue 2: Nginx port conflict with existing service

**What happened:**
After fixing the build, `docker compose up` started but Nginx failed to bind to the host port. The error was something like:

```
Error starting userland proxy: listen tcp 0.0.0.0:80: bind: address already in use
```

**Why it happened:**
I had mapped Nginx to port `80` on the host (`"80:80"`), but something else on my Ubuntu machine was already using port 80 (probably Apache or another service).

**How I fixed it:**
I changed the host port mapping to `8082`:

```yaml
nginx:
  ports:
    - "8082:80"
```

Now the app was reachable at `http://localhost:8082`.

**What I learned:**
Host port `80` is often already taken on Linux. It is good practice to use a non-privileged high port (`8000+`) during development.

---

### 🔴 Issue 3: Flask started before MySQL was ready

**What happened:**
The Flask container kept crashing with database connection errors on first startup. If I restarted it manually a few seconds later, it worked fine.

**Why it happened:**
`docker compose up` starts containers in parallel. Flask was trying to connect to MySQL before MySQL had finished initialising. MySQL takes ~20–30 seconds on first start to create its data directory.

**How I fixed it:**
I added two things:

1. A **healthcheck** to the MySQL service:

```yaml
healthcheck:
  test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
  interval: 5s
  timeout: 5s
  retries: 10
```

2. A **depends_on** with a condition in Flask:

```yaml
depends_on:
  db:
    condition: service_healthy
```

Now Flask only starts after MySQL is healthy.

I also added a retry loop inside `app.py` (`initialize_database()`) that retries up to 10 times, 3 seconds apart. That is a second layer of safety.

**What I learned:**
- `depends_on` alone only waits for the container to *start*, not to be *ready*.
- `condition: service_healthy` is the correct way to wait for MySQL.
- Always add a retry loop in the app as well — belt and braces.

---

## Part 2 — Image Build & Docker Hub Issues

### 🔴 Issue 4: `docker build` hung while pulling `moby/buildkit`

**What happened:**
When I ran:

```bash
docker build -t devops-tracker-backend:latest ./backend
```

It got stuck for over 4 minutes on "booting buildkit" and then failed:

```
Post "http://docker.example.com/v1.45/images/create?fromImage=docker.io%2Fmoby%2Fbuildkit&tag=buildx-stable-1": context canceled
```

**Why it happened:**
Two things were wrong:

1. My `DOCKER_HOST` environment variable was pointing to a weird value (`docker.example.com`) — probably left over from an earlier experiment.
2. **Buildx** (Docker's newer builder) launches a separate BuildKit container (`moby/buildkit:buildx-stable-1`) to do the build. Since my Docker context was already pointing to Minikube's daemon (via `eval $(minikube docker-env)`), Buildx got confused about which daemon to talk to.

**How I fixed it:**

1. Cleared the stale environment variable:

```bash
unset DOCKER_HOST
docker context use default
```

2. Disabled BuildKit and used the classic builder instead:

```bash
DOCKER_BUILDKIT=0 docker build -t devops-tracker-backend:latest ./backend
```

This worked instantly.

**What I learned:**
- `DOCKER_BUILDKIT=0` forces the classic builder and avoids the BuildKit container-launch issue.
- Always check `echo $DOCKER_HOST` and `docker context show` when Docker behaves strangely.
- When pointing Docker at Minikube's daemon, Buildx is often more trouble than it is worth.

---

### 🔴 Issue 5: `ErrImagePull` / `ImagePullBackOff` in Kubernetes

**What happened:**
After deploying to Kubernetes with `kubectl apply -f k8s/`, pods went into:

```
ErrImagePull
ImagePullBackOff
```

Even the `mysql:8.4` pod failed to pull.

**Why it happened:**
Minikube's internal network (the Docker bridge network inside the Minikube VM) could not reach `registry-1.docker.io` reliably. This is a very common Minikube issue on Ubuntu with the Docker driver.

**How I fixed it:**

1. First, on the **host** machine, I pulled the images normally:

```bash
docker pull mysql:8.4
docker pull hritikranjan1/devops-learning-tracker-backend:1.0
docker pull hritikranjan1/devops-learning-tracker-nginx:1.0
```

2. Then I loaded them into Minikube's internal container runtime:

```bash
minikube image load mysql:8.4
minikube image load hritikranjan1/devops-learning-tracker-backend:1.0
minikube image load hritikranjan1/devops-learning-tracker-nginx:1.0
```

3. Confirmed they were inside Minikube:

```bash
minikube image ls | grep -E "mysql|devops-learning"
```

4. Ensured each Deployment used `imagePullPolicy: IfNotPresent` so K8s would use the local image instead of trying to pull.

**What I learned:**
- `minikube image load` is the fastest way to bypass Minikube network issues.
- `imagePullPolicy: IfNotPresent` tells Kubernetes to use the local cache if it exists.
- `imagePullPolicy: Never` is even stricter — it will only use what is already inside Minikube.

---

## Part 3 — Kubernetes Migration Issues

### 🔴 Issue 6: `CreateContainerConfigError` — `secret "db-secret" not found`

**What happened:**
After deploying to Kubernetes, `db` and `web` pods went into:

```
CreateContainerConfigError
```

Nginx pod was running fine (it did not need any Secret).

**Why it happened:**
When I ran `kubectl apply -f k8s/` the first time, the output did **not** include `secret/db-secret created`. This meant:

- Either `k8s/01-secret.yaml` was missing
- Or it was applied to the wrong namespace
- Or I forgot to include it

Since both the `db` and `web` Deployments use `secretKeyRef` pointing to `db-secret`, Kubernetes could not create the container. It failed while trying to resolve the Secret.

**How I fixed it:**

1. Confirmed the Secret was missing:

```bash
kubectl get secret -n devtrack
# Only "default-token-xxx" appeared — no db-secret.
```

2. Recreated the file:

```bash
cat > k8s/01-secret.yaml <<'EOF'
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
EOF
```

3. Applied it:

```bash
kubectl apply -f k8s/01-secret.yaml
```

4. Verified:

```bash
kubectl get secret -n devtrack
# db-secret   Opaque   4   ...
```

5. Restarted the Deployments so they could pick up the Secret:

```bash
kubectl rollout restart deployment/db deployment/web -n devtrack
```

**What I learned:**
- `CreateContainerConfigError` almost always means a referenced Secret or ConfigMap is missing or has a wrong key name.
- `kubectl describe pod` shows the exact reason in the Events section.
- Always verify with `kubectl get secret,configmap -n devtrack` after applying.

---

### 🔴 Issue 7: `CreateContainerConfigError` due to wrong namespace

**What happened:**
Even after creating the Secret, the error persisted in some attempts.

**Why it happened:**
The Secret YAML sometimes did not include `namespace: devtrack` in `metadata`. Kubernetes then created the Secret in the `default` namespace. Since the Deployments were in `devtrack`, they could not find it.

**How I fixed it:**
I ensured **every** YAML file had:

```yaml
metadata:
  namespace: devtrack
```

Verified with:

```bash
grep -H "namespace:" k8s/*.yaml
```

**What I learned:**
Kubernetes is namespace-scoped. A Secret in `default` is invisible to pods in `devtrack`.

---

## Part 4 — MySQL on Kubernetes Issues

### 🔴 Issue 8: MySQL `CrashLoopBackOff` — corrupted InnoDB redo logs

**What happened:**
After the Secret was fixed, the MySQL pod started, ran for a few seconds, then crashed. It kept restarting with `CrashLoopBackOff`. The logs showed:

```
[ERROR] [InnoDB] Cannot create redo log files because data files are corrupt 
or the database was not shut down cleanly after creating the data files.
[ERROR] [MY-012930] [InnoDB] Plugin initialization aborted with error Generic error.
[ERROR] [MY-010334] [Server] Failed to initialize DD Storage Engine
[ERROR] [MY-010020] [Server] Data Dictionary initialization failed.
[ERROR] [MY-010119] [Server] Aborting
```

**Why it happened:**
This was a **chain of events**:

1. On the very first deploy, MySQL started without the Secret → it could not initialise → it was killed.
2. But the **PVC was already mounted and bound**. MySQL wrote a partial initial data directory (including redo log files) before being killed.
3. When MySQL was restarted (after the Secret was fixed), it found **half-written redo log files** in the PVC.
4. MySQL's InnoDB engine refuses to start if it detects a partial or corrupt redo log from a previous unclean shutdown.
5. Result: `CrashLoopBackOff`.

**How I fixed it:**

1. I **deleted the entire namespace** to clean up the PVC too:

```bash
kubectl delete namespace devtrack
sleep 30
kubectl get namespace devtrack    # Confirmed NotFound
```

2. I added `securityContext.fsGroup: 999` to the MySQL Deployment so the `mysql` user (UID 999) could own the PVC files:

```yaml
spec:
  template:
    spec:
      securityContext:
        fsGroup: 999
```

3. I increased the liveness probe delay so MySQL would not be killed during first-time initialisation:

```yaml
livenessProbe:
  initialDelaySeconds: 60        # was 40
  periodSeconds: 15
```

4. I re-applied all YAMLs and MySQL initialised cleanly.

**What I learned:**
- MySQL on Kubernetes **must** have a clean PVC. If a crash happens mid-initialisation, the PVC is useless — delete it and start over.
- `securityContext.fsGroup: 999` is essential for MySQL. Without it, the container user cannot write to the volume.
- `livenessProbe.initialDelaySeconds` must be large enough for first-time DB init — otherwise the probe kills the pod mid-init.
- Use `strategy: Recreate` for MySQL so old and new pods don't fight over the same PVC.

---

### 🔴 Issue 9: PVC permission denied

**What happened:**
Even before the redo log error, I saw permission errors:

```
mysqld: Can't create/write to file '/var/lib/mysql/...' (Errcode: 13 - Permission denied)
```

**Why it happened:**
The PVC was created with `root:root` ownership. But the MySQL container image runs as user `mysql` (UID 999). Without `fsGroup`, the container could not write.

**How I fixed it:**
Added `securityContext.fsGroup: 999` at the pod level in the MySQL Deployment. Kubernetes then recursively changed the PVC's group ownership to GID 999 on mount.

**What I learned:**
`fsGroup` is the Kubernetes-native way to fix volume permissions for non-root containers.

---

## Part 5 — Networking & Nginx Issues

### 🔴 Issue 10: Nginx returned 502 Bad Gateway

**What happened:**
Nginx pod was running, the browser loaded the frontend, but every `/api/*` call returned `502 Bad Gateway`.

**Why it happened:**
Nginx proxies `/api/` to `http://web:5000`. But the `web` pod was not ready at the time. Kubernetes had no ready endpoints for the `web` Service, so Nginx could not connect.

**How I fixed it:**

1. Checked endpoints:

```bash
kubectl get endpoints web -n devtrack
# ENDPOINTS column was empty
```

2. Checked the web pod:

```bash
kubectl get pods -n devtrack -l app=web
# Pod was not Ready
```

3. Once the web pod became Ready (its `/api/health` readiness probe passed), the endpoint was registered automatically and Nginx started working.

**What I learned:**
- A `502` from Nginx usually means "backend unreachable".
- `kubectl get endpoints <service>` is the fastest way to check if a Service has any ready pods behind it.
- Readiness probes solve this automatically — the pod is only added to the Service once it is truly ready.

---

### 🔴 Issue 11: DNS resolution between pods failed

**What happened:**
At one point, the Flask pod could not resolve the hostname `db`.

**Why it happened:**
The MySQL Service was created but had no endpoints because the MySQL pod was not ready.

**How I fixed it:**
Once MySQL became healthy and the Service got endpoints, `db` resolved correctly to the ClusterIP.

Verified with:

```bash
kubectl exec -it -n devtrack deploy/web -- sh
# inside:
getent hosts db
# returned 10.x.x.x
```

**What I learned:**
- Kubernetes Services get a DNS name automatically (same as the Service name).
- If the underlying pods aren't ready, the DNS name resolves but with no working backend — that leads to connection refused.

---

## 🎯 Key Takeaways

Here are the biggest lessons I learned from all these issues:

### On Docker Compose

1. `depends_on` alone is not enough. Use `condition: service_healthy`.
2. Always add retry logic in the app for DB connections.
3. Watch out for host port conflicts during local development.
4. `build.context` must exactly point to the folder containing the Dockerfile.

### On Image Builds

1. `DOCKER_BUILDKIT=0` is your friend when BuildKit misbehaves.
2. Always verify `docker context show` and `unset DOCKER_HOST` when Docker acts weird.
3. Use `minikube image load` to bypass Minikube's network issues.
4. Use `imagePullPolicy: IfNotPresent` so K8s uses local images.

### On Kubernetes

1. Every YAML must have the correct `namespace`.
2. `kubectl describe pod` and `kubectl logs --previous` are your best debugging tools.
3. Use `initContainer` instead of `depends_on`.
4. Add `readinessProbe` and `livenessProbe` — but with **generous `initialDelaySeconds`** for databases.
5. Use `securityContext.fsGroup: 999` for MySQL so the container can write to its PVC.
6. Use `strategy: Recreate` for MySQL — not RollingUpdate.
7. Never reuse a PVC that was written to by a crashed MySQL pod. Delete it and start fresh.

### On the Migration Process

1. Docker Compose → Kubernetes is not just a YAML translation. Many things change: networking model, health check model, volume model.
2. Compose's `mem_limit` → K8s `resources.limits.memory`.
3. Compose's healthcheck → K8s `readinessProbe` + `livenessProbe`.
4. Compose's `depends_on` → K8s `initContainer`.
5. Compose's named volume → K8s `PersistentVolumeClaim`.

### On Debugging in Kubernetes

Best order to debug any pod failure:

```bash
kubectl get pods -n devtrack                    # What is the state?
kubectl describe pod -n devtrack <pod>          # What does the Event log say?
kubectl logs -n devtrack <pod>                  # What did the container print?
kubectl logs -n devtrack <pod> --previous       # What did it print before crashing?
kubectl get endpoints -n devtrack               # Are services actually connected?
kubectl get events -n devtrack --sort-by='.lastTimestamp'
```

---

## 📌 Summary

Every issue in this project had a real cause and a real fix. None of them were random. The pattern was:

- **Build issues** — wrong path, wrong context, wrong environment variable.
- **Startup issues** — wrong ordering, missing dependency wait.
- **Config issues** — wrong namespace, missing Secret/ConfigMap.
- **Runtime issues** — permission, health probe timing, unclean shutdown.
- **Networking issues** — endpoint not ready, DNS with no backend.

Fixing each of them made me understand Kubernetes much deeper than just reading about it. This file is my personal record of that journey.

---

## 👨‍💻 Author

**Hritik Ranjan**
DevOps & Cloud Learner

- GitHub: https://github.com/hritikranjan1
- LinkedIn: https://www.linkedin.com/in/hritikranjan1/
- Blog: https://blogs.hritikranjan.in
- Website: https://hritikranjan.in