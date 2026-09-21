# 📘 Complete User Guide — DevOps Learning Tracker (Kubernetes)

This guide will walk you through **everything** you need to do to run this project on your own machine — from installing the required tools to accessing the running application in your browser.

The guide is written in **very simple language**. Even if you have never used Kubernetes before, you can follow along step by step.

---

## 📑 Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [Architecture Overview](#2-architecture-overview)
3. [What You Will Need (Prerequisites)](#3-what-you-will-need-prerequisites)
4. [Step 1 — Install the Required Tools](#step-1--install-the-required-tools)
5. [Step 2 — Clone the Project](#step-2--clone-the-project)
6. [Step 3 — Understand the Files](#step-3--understand-the-files)
7. [Step 4 — Get the Docker Images](#step-4--get-the-docker-images)
8. [Step 5 — Start Minikube](#step-5--start-minikube)
9. [Step 6 — Deploy the Application](#step-6--deploy-the-application)
10. [Step 7 — Watch the Pods Come Up](#step-7--watch-the-pods-come-up)
11. [Step 8 — Access the Application](#step-8--access-the-application)
12. [Step 9 — Test the Application](#step-9--test-the-application)
13. [Step 10 — Verify Data Persistence](#step-10--verify-data-persistence)
14. [How to Stop Everything](#how-to-stop-everything)
15. [How to Restart the Application](#how-to-restart-the-application)
16. [How to Update the Application](#how-to-update-the-application)
17. [Troubleshooting Guide](#troubleshooting-guide)
18. [Useful Commands Cheat Sheet](#useful-commands-cheat-sheet)
19. [Frequently Asked Questions](#frequently-asked-questions)

---

## 1. What Is This Project?

This is a simple **three-tier web application** called **DevOps Learning Tracker**.

You can use it to **track your DevOps learning progress**:
- Add topics you are learning (Docker, Kubernetes, AWS, etc.)
- Mark them as "In Progress" or "Completed"
- Track your progress with a percentage
- See statistics like total topics, completed topics, and average progress

The app has three main parts:

| Part | What It Does |
|------|--------------|
| **Frontend + Nginx** | The user interface you see in the browser |
| **Backend (Flask)** | The API that handles your requests and talks to the database |
| **Database (MySQL)** | Stores your learning data permanently |

All three parts are running **separately inside containers** and are managed by **Kubernetes**.

---

## 2. Architecture Overview

Here is how the pieces fit together:

```text
   ┌──────────────┐
   │    User      │  (Your browser)
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │    Nginx     │  ← Reverse proxy + serves the frontend
   │ NodePort     │
   │   30082      │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │    Flask     │  ← REST API backend
   │  ClusterIP   │
   │    5000      │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │    MySQL     │  ← Database
   │  ClusterIP   │
   │    3306      │
   └──────┬───────┘
          │
          ▼
   ┌──────────────┐
   │ Persistent   │  ← Data stored here permanently
   │ Volume Claim │
   └──────────────┘
```

**In simple words:**
- The **browser** talks only to **Nginx**.
- Nginx forwards API requests to **Flask**.
- Flask talks to **MySQL**.
- MySQL saves data to the **Persistent Volume**.

---

## 3. What You Will Need (Prerequisites)

Before starting, make sure your computer has:

| Requirement | Minimum |
|-------------|---------|
| Operating System | Ubuntu 20.04+ / macOS / Windows with WSL2 |
| RAM | 4 GB free (for Minikube) |
| CPU | 2 cores |
| Disk Space | 5 GB free |
| Internet | Required (for first-time pull) |

You also need some basic comfort with the **terminal** (running commands, changing directories). You do **not** need to know Kubernetes already — that is what this guide is for.

---

## Step 1 — Install the Required Tools

You need **four tools** installed:

1. **Docker** — to run containers
2. **kubectl** — the Kubernetes command-line tool
3. **Minikube** — a small Kubernetes cluster that runs on your laptop
4. **Git** — to clone the project

### 1.1 Install Docker

**Ubuntu:**
```bash
sudo apt update
sudo apt install -y docker.io
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

**Important:** Log out and log back in (or run `newgrp docker`) so the docker group applies.

Verify:
```bash
docker --version
```
You should see something like `Docker version 24.x.x`.

### 1.2 Install kubectl

**Ubuntu:**
```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
rm kubectl
```

Verify:
```bash
kubectl version --client
```

### 1.3 Install Minikube

**Ubuntu:**
```bash
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
rm minikube-linux-amd64
```

Verify:
```bash
minikube version
```

### 1.4 Install Git

**Ubuntu:**
```bash
sudo apt install -y git
```

Verify:
```bash
git --version
```

Once all four tools are installed, you are ready to continue.

---

## Step 2 — Clone the Project

Open a terminal and run:

```bash
cd ~/Desktop
git clone https://github.com/hritikranjan1/devops-learning-tracker-k8s.git
cd devops-learning-tracker-k8s
```

Now you are inside the project folder. Verify with:

```bash
pwd
ls
```

You should see folders like `backend/`, `nginx/`, `k8s/`, and files like `README.md`.

---

## Step 3 — Understand the Files

Here is a quick tour of what each folder contains:

```text
devops-learning-tracker-k8s/
│
├── backend/                       # Flask API code
│   ├── app.py                     # Main application file
│   ├── requirements.txt           # Python dependencies
│   └── Dockerfile                 # How to build the backend image
│
├── nginx/                         # Nginx reverse proxy
│   ├── nginx.conf                 # Nginx configuration
│   └── Dockerfile                 # How to build the nginx image
│
├── k8s/                           # All Kubernetes manifests
│   ├── 00-namespace.yaml          # Creates the namespace "devtrack"
│   ├── 01-secret.yaml             # DB passwords (dummy values)
│   ├── 02-configmap.yaml          # Non-secret configuration
│   ├── 03-mysql-pvc.yaml          # Persistent Volume Claim for MySQL
│   ├── 04-mysql-deployment.yaml   # MySQL Deployment
│   ├── 05-mysql-service.yaml      # MySQL Service (ClusterIP)
│   ├── 06-backend-deployment.yaml # Flask Deployment
│   ├── 07-backend-service.yaml    # Flask Service (ClusterIP)
│   ├── 08-nginx-deployment.yaml   # Nginx Deployment
│   └── 09-nginx-service.yaml      # Nginx Service (NodePort)
│
├── README.md                      # Project overview
├── ISSUES.md                      # Problems I faced and fixed
└── USER_GUIDE.md                  # This file
```

**Note:** All the Kubernetes files are numbered `00-` to `09-` so they can be applied in order.

---

## Step 4 — Get the Docker Images

This project uses **three Docker images**:

1. `mysql:8.4` — official MySQL image
2. `hritikranjan1/devops-learning-tracker-backend:1.0` — the Flask backend
3. `hritikranjan1/devops-learning-tracker-nginx:1.0` — the Nginx frontend

### Option A (Recommended) — Pull Images on the Host

```bash
docker pull mysql:8.4
docker pull hritikranjan1/devops-learning-tracker-backend:1.0
docker pull hritikranjan1/devops-learning-tracker-nginx:1.0
```

Verify:
```bash
docker images | grep -E "mysql|devops-learning"
```

You should see all three images listed.

### Option B — Load Images Directly into Minikube

If your Minikube has trouble pulling images from Docker Hub (common on Ubuntu with the docker driver), you can load them directly:

```bash
# First, pull on the host as above
docker pull mysql:8.4
docker pull hritikranjan1/devops-learning-tracker-backend:1.0
docker pull hritikranjan1/devops-learning-tracker-nginx:1.0

# Then, load them inside Minikube
minikube image load mysql:8.4
minikube image load hritikranjan1/devops-learning-tracker-backend:1.0
minikube image load hritikranjan1/devops-learning-tracker-nginx:1.0

# Verify
minikube image ls | grep -E "mysql|devops-learning"
```

You should see all three images listed **inside** Minikube.

---

## Step 5 — Start Minikube

Start the local Kubernetes cluster:

```bash
minikube start --driver=docker --memory=4096 --cpus=2
```

**What the flags mean:**
- `--driver=docker` → use Docker as the VM driver (simplest on Ubuntu)
- `--memory=4096` → give Minikube 4 GB RAM
- `--cpus=2` → give Minikube 2 CPU cores

Verify:
```bash
minikube status
kubectl get nodes
```

Expected output from `kubectl get nodes`:
```
NAME       STATUS   ROLES           AGE   VERSION
minikube   Ready    control-plane   30s   v1.xx.x
```

The `Ready` status confirms Kubernetes is running.

---

## Step 6 — Deploy the Application

Now deploy everything with one command:

```bash
kubectl apply -f k8s/
```

Expected output:
```
namespace/devtrack created
secret/db-secret created
configmap/db-config created
persistentvolumeclaim/mysql-pvc created
deployment.apps/db created
service/db created
deployment.apps/web created
service/web created
deployment.apps/nginx created
service/nginx created
```

**What just happened?** Kubernetes read all the YAML files and:
- Created a namespace called `devtrack`
- Created a Secret and ConfigMap for configuration
- Created a PVC for database storage
- Created three Deployments (db, web, nginx)
- Created three Services (db, web, nginx)

Everything is now under the `devtrack` namespace.

---

## Step 7 — Watch the Pods Come Up

Run this command to see the pods starting:

```bash
kubectl get pods -n devtrack -w
```

**What you will see (in the first 2 minutes):**

```
NAME                    READY   STATUS              AGE
db-xxx                  0/1     ContainerCreating   3s
db-xxx                  0/1     Running             15s
db-xxx                  1/1     Running             40s
web-xxx                 0/1     Init:0/1            5s
web-xxx                 0/1     Init:0/1            45s
web-xxx                 0/1     PodInitializing     55s
web-xxx                 1/1     Running             80s
nginx-xxx               1/1     Running             80s
```

**Simple explanation of each status:**
- `ContainerCreating` — the pod is being created
- `Init:0/1` — the pod is running its init container (waiting for MySQL to be ready)
- `Running` — the pod is up and working
- `1/1` in the READY column — the pod is healthy

Once all three pods show `1/1 Running`, press `Ctrl+C` to stop watching.

---

## Step 8 — Access the Application

Now you are ready to open the app in your browser.

### Option A — Automatic Browser Opening (Easiest)

```bash
minikube service nginx -n devtrack
```

This will:
- Print the URL of the app
- Automatically open it in your default browser

The URL will look like:
```
http://192.168.49.2:30082
```

### Option B — Manual URL

If automatic opening does not work:

```bash
minikube ip
```

You will get an IP like `192.168.49.2`. Open your browser and visit:

```
http://<minikube-ip>:30082
```

For example:
```
http://192.168.49.2:30082
```

You should see the **DevOps Learning Tracker dashboard** with the sidebar, hero section, and statistics cards (all showing 0).

---

## Step 9 — Test the Application

### Through the Browser

1. Click the **"Add Learning"** button (top-right corner or in the hero section)
2. Fill in the form:
   - **Topic Name:** `Docker Compose`
   - **Category:** `Docker`
   - **Status:** `Completed`
   - **Progress:** `100%`
3. Click **"Save Learning"**
4. A green toast message will appear: `✓ Learning added`

The dashboard will update immediately:
- **Total Topics:** 1
- **Completed:** 1
- **Average Progress:** 100%

Add another item:
- **Topic:** `Kubernetes`
- **Category:** `Kubernetes`
- **Status:** `In Progress`
- **Progress:** `60%`

Statistics will now show:
- **Total Topics:** 2
- **Completed:** 1
- **In Progress:** 1
- **Average Progress:** 80%

### Through the Terminal (Optional)

Check that the API is working:

```bash
kubectl exec -n devtrack deploy/web -- wget -qO- http://localhost:5000/api/health
```

Expected output:
```json
{"status":"healthy","service":"flask"}
```

Get all learning items:

```bash
kubectl exec -n devtrack deploy/web -- wget -qO- http://localhost:5000/api/learning
```

Query the database directly:

```bash
kubectl exec -it -n devtrack deploy/db -- mysql -u devuser -pdevpassword devops_tracker -e "SELECT * FROM learning_items;"
```

You should see all the rows you added through the browser.

---

## Step 10 — Verify Data Persistence

This is the important part — proving that data is stored **permanently** in the PVC.

### Test 1: Delete the MySQL Pod

```bash
kubectl delete pod -n devtrack -l app=db
```

Kubernetes will automatically create a new `db` pod. Watch it:

```bash
kubectl get pods -n devtrack -w
```

Wait until the new `db` pod shows `1/1 Running`, then press `Ctrl+C`.

Now check the data:

```bash
kubectl exec -it -n devtrack deploy/db -- mysql -u devuser -pdevpassword devops_tracker -e "SELECT COUNT(*) FROM learning_items;"
```

**Expected:** Your data is still there! The pod was destroyed, but the data survived because it is stored in the PVC.

### Test 2: Delete All Deployments

Even stronger test:

```bash
kubectl delete deployment db web nginx -n devtrack
kubectl apply -f k8s/
```

Wait for pods to come back:

```bash
kubectl get pods -n devtrack -w
```

Check the data:

```bash
kubectl exec -it -n devtrack deploy/db -- mysql -u devuser -pdevpassword devops_tracker -e "SELECT COUNT(*) FROM learning_items;"
```

**Expected:** Data is still there.

---

## How to Stop Everything

### Option 1: Stop the Application Only (Keep Minikube Running)

Delete just the app's namespace:

```bash
kubectl delete namespace devtrack
```

This removes all pods, services, PVCs and secrets inside the namespace. Minikube stays running.

To restart the application later, simply:

```bash
kubectl apply -f k8s/
```

### Option 2: Stop Minikube (Keep the Cluster Data)

```bash
minikube stop
```

This shuts down the cluster but keeps the data. To start it again:

```bash
minikube start
```

### Option 3: Delete Minikube Completely

```bash
minikube delete
```

This removes the whole cluster and everything inside it. Next time you run `minikube start`, it will be a fresh cluster.

---

## How to Restart the Application

If you stopped the app but Minikube is still running:

```bash
cd ~/Desktop/devops-learning-tracker-k8s
kubectl apply -f k8s/
kubectl get pods -n devtrack -w
```

Once all pods are `Running`, access the app again:

```bash
minikube service nginx -n devtrack
```

---

## How to Update the Application

### Update the Backend Code

1. Make changes to `backend/app.py`
2. Build a new image with a **new tag**:

```bash
cd backend
docker build -t hritikranjan1/devops-learning-tracker-backend:v2 .
docker push hritikranjan1/devops-learning-tracker-backend:v2
```

3. Update the Deployment to use the new tag:

```bash
kubectl set image deployment/web -n devtrack web=hritikranjan1/devops-learning-tracker-backend:v2
```

4. Watch the rollout:

```bash
kubectl rollout status deployment/web -n devtrack
```

5. If something goes wrong, roll back:

```bash
kubectl rollout undo deployment/web -n devtrack
```

### Update Kubernetes Manifests

If you edit any file inside `k8s/`:

```bash
kubectl apply -f k8s/
```

Kubernetes will apply only the changes.

---

## Troubleshooting Guide

### Problem 1: Pods Stuck in `ImagePullBackOff`

**Symptom:**
```
NAME     READY   STATUS             RESTARTS   AGE
web-xxx  0/1     ImagePullBackOff   0          2m
```

**Cause:** Minikube cannot pull the image from Docker Hub.

**Fix:**

```bash
# Pull on host
docker pull hritikranjan1/devops-learning-tracker-backend:1.0

# Load inside Minikube
minikube image load hritikranjan1/devops-learning-tracker-backend:1.0

# Restart the deployment
kubectl rollout restart deployment/web -n devtrack
```

---

### Problem 2: `CreateContainerConfigError` — Secret Not Found

**Symptom:**
```
web-xxx  0/1  CreateContainerConfigError
```

Check the events:

```bash
kubectl describe pod -n devtrack -l app=web | tail -20
```

You might see:
```
Error: secret "db-secret" not found
```

**Fix:**

```bash
# Apply the secret explicitly
kubectl apply -f k8s/01-secret.yaml

# Verify
kubectl get secret -n devtrack

# Restart
kubectl rollout restart deployment/web -n devtrack
```

---

### Problem 3: MySQL Keeps Restarting (`CrashLoopBackOff`)

**Symptom:**
```
db-xxx  0/1  CrashLoopBackOff
```

Check the logs:

```bash
kubectl logs -n devtrack deploy/db --previous --tail=50
```

If you see:
```
InnoDB: Cannot create redo log files because data files are corrupt
```

**Cause:** MySQL was killed during first-time initialisation, leaving partial data in the PVC.

**Fix:** Delete the PVC and namespace, then redeploy:

```bash
kubectl delete namespace devtrack
sleep 30
kubectl apply -f k8s/
```

This wipes the corrupted PVC and starts MySQL fresh.

---

### Problem 4: Nginx Returns 502 Bad Gateway

**Symptom:** Browser shows `502 Bad Gateway` when loading the app.

**Cause:** The backend (`web`) pod is not ready.

**Check:**

```bash
kubectl get endpoints web -n devtrack
```

If `ENDPOINTS` is empty, the backend is not registered.

**Fix:**

```bash
# Check what is wrong with web pod
kubectl get pods -n devtrack -l app=web
kubectl logs -n devtrack deploy/web --tail=50
```

Once the web pod is `1/1 Running`, Nginx will automatically work.

---

### Problem 5: PVC Stuck in `Pending`

**Symptom:**
```
mysql-pvc   Pending
```

**Cause:** No default StorageClass.

**Fix:**

```bash
kubectl get storageclass
```

If `standard` is not marked `(default)`:

```bash
kubectl patch storageclass standard -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'
kubectl delete pvc mysql-pvc -n devtrack
kubectl apply -f k8s/03-mysql-pvc.yaml
```

---

## Useful Commands Cheat Sheet

### Get Information

```bash
# All resources in the namespace
kubectl get all -n devtrack

# Just pods
kubectl get pods -n devtrack

# Just services
kubectl get svc -n devtrack

# PVCs
kubectl get pvc -n devtrack

# Secrets and ConfigMaps
kubectl get secret,configmap -n devtrack

# Endpoints
kubectl get endpoints -n devtrack
```

### Logs

```bash
# Web (Flask) logs
kubectl logs -n devtrack deploy/web --tail=100

# Database logs
kubectl logs -n devtrack deploy/db --tail=100

# Nginx logs
kubectl logs -n devtrack deploy/nginx --tail=100

# Logs from the previous run of a crashed pod
kubectl logs -n devtrack deploy/db --previous
```

### Execute Commands Inside a Pod

```bash
# Get a shell in the web pod
kubectl exec -it -n devtrack deploy/web -- sh

# MySQL CLI
kubectl exec -it -n devtrack deploy/db -- mysql -u root -prootpassword
```

### Restart / Rollout

```bash
# Restart web deployment
kubectl rollout restart deployment/web -n devtrack

# Check rollout status
kubectl rollout status deployment/web -n devtrack

# Undo last rollout
kubectl rollout undo deployment/web -n devtrack

# View rollout history
kubectl rollout history deployment/web -n devtrack
```

### Scaling

```bash
# Scale web to 3 replicas
kubectl scale deployment web -n devtrack --replicas=3
```

### Debugging

```bash
# Describe a pod
kubectl describe pod -n devtrack -l app=web

# Recent events
kubectl get events -n devtrack --sort-by='.lastTimestamp' | tail -20
```

---

## Frequently Asked Questions

### Q1. Do I need to know Kubernetes to run this?

No. This guide covers everything you need. Basic terminal knowledge is enough.

### Q2. Why is the port `30082`?

Port `30082` is a NodePort — a way for Kubernetes to expose a service to the outside world. It was chosen to avoid conflicts with the `8082` port used by Docker Compose.

### Q3. Why does MySQL take so long to start?

On the first run, MySQL initialises its data directory (creates databases, tables, users). This takes 30–60 seconds. On subsequent runs, it is much faster.

### Q4. Can I use this on macOS or Windows?

Yes. Install Docker Desktop, kubectl, and Minikube for your OS. The commands in this guide are identical except for path separators.

### Q5. How do I change the database password?

Edit `k8s/01-secret.yaml`, update `MYSQL_ROOT_PASSWORD` and `MYSQL_PASSWORD`, then:

```bash
kubectl delete secret db-secret -n devtrack
kubectl apply -f k8s/01-secret.yaml
kubectl rollout restart deployment/db deployment/web -n devtrack
```

### Q6. What happens if I lose my Minikube cluster?

If you `minikube delete`, you lose the PVC and all data. Make sure you back up important data before deleting the cluster.

### Q7. Can I access the app from another machine on my network?

By default, Minikube's IP is only accessible from your machine. For remote access, you would need to configure `minikube tunnel` or use an Ingress controller.

### Q8. How do I see the SQL tables created by the app?

```bash
kubectl exec -it -n devtrack deploy/db -- mysql -u root -prootpassword devops_tracker
```

Then inside the MySQL prompt:
```sql
SHOW TABLES;
SELECT * FROM learning_items;
```

---

## 🎉 You Are Done

At this point, you have:
- A working three-tier application running on Kubernetes
- Data stored persistently in a PVC
- Three services communicating with each other over ClusterIP
- A single entry point via Nginx NodePort

If you made it this far — congratulations! You just deployed a real Kubernetes project.

---

## 📚 Next Steps to Learn

Once you are comfortable with this setup, try:

1. **Ingress** — a cleaner way to expose services with hostnames
2. **HorizontalPodAutoscaler** — auto-scale the backend based on CPU
3. **Helm** — package all these YAMLs into a reusable chart
4. **CI/CD with GitHub Actions** — auto-build and deploy on every push
5. **Monitoring with Prometheus + Grafana** — visualise metrics
6. **StatefulSet for MySQL** — production-grade database deployment

---

## 👨‍💻 Author

**Hritik Ranjan**
DevOps & Cloud Learner

- GitHub: https://github.com/hritikranjan1
- LinkedIn: https://www.linkedin.com/in/hritikranjan1/
- Blog: https://blogs.hritikranjan.in
- Website: https://hritikranjan.in

---

**Happy Learning! 🚀**