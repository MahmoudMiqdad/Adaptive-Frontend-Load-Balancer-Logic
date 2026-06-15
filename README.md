# Mahmoud Adaptive Edge Balancer

This project is a **distributed systems simulation** that implements a custom load balancing engine called `MahmoudBalancerCore`.

It demonstrates multiple real-world load balancing strategies used in modern backend and edge systems, including:

* Round Robin
* Weighted Round Robin
* Least Connections
* Lowest Latency
* Random & Weighted Random
* Power of Two Choices
* Consistent Hashing (client affinity)
* Adaptive Scoring (smart routing based on telemetry)

###  Key Features

* Dynamic node state management (ONLINE / OFFLINE / DRAINING)
* Real-time routing decisions with detailed telemetry
* Failover handling when nodes go offline
* Burst traffic simulation
* Adaptive scoring based on:

  * latency
  * active connections
  * error rate
  * CPU load
  * weight

###  Testing

The system is fully tested using **Vitest**, covering:

* Routing only to online nodes
* Correct round-robin rotation
* Least connections selection
* Lowest latency selection
* Consistent hashing stability
* Failover scenarios
* Traffic distribution tracking
* Adaptive scoring correctness
* Full rejection when all nodes are offline

###  UI Simulation

A React-based UI is included to:

* Visualize cluster state
* Simulate traffic
* Change strategies dynamically
* Apply pressure to nodes
* Observe routing decisions in real-time

