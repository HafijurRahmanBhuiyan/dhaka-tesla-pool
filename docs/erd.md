# Entity Relationship Diagram

Mirrors `backend/prisma/schema.prisma`. All money fields are integer poysha (1 Taka = 100 Poysha). `RideRequest.status` and `Pool.status` share the same `RideStatus` lifecycle enum.

```mermaid
erDiagram
    User {
        int id PK
        string name
        string phone UK
        string email UK
        string passwordHash
        enum role
        datetime createdAt
    }
    Tesla {
        int id PK
        int driverId FK
        string plateNickname
        int seatCapacity
        boolean isActive
    }
    Zone {
        int id PK
        string name UK
    }
    RideRequest {
        int id PK
        int passengerId FK
        int pickupZoneId FK
        int dropoffZoneId FK
        enum status
        datetime requestedAt
        int poolId FK
    }
    Pool {
        int id PK
        int teslaId FK
        enum status
        int seatsUsed
        datetime startedAt
        datetime completedAt
    }
    Fare {
        int id PK
        int rideRequestId FK
        int baseFarePoysha
        int distanceChargePoysha
        int poolDiscountPoysha
        int totalFarePoysha
        enum paymentMethod
        datetime paidAt
    }
    RideStatusHistory {
        int id PK
        int rideRequestId FK
        enum fromStatus
        enum toStatus
        datetime changedAt
    }

    User ||--o{ Tesla : "owns (Cascade)"
    User ||--o{ RideRequest : "requests (Restrict)"
    Zone ||--o{ RideRequest : "pickup (Restrict)"
    Zone ||--o{ RideRequest : "dropoff (Restrict)"
    Pool ||--o{ RideRequest : "contains (SetNull)"
    Tesla ||--o{ Pool : "serves (Restrict)"
    RideRequest ||--o| Fare : "priced by (Cascade)"
    RideRequest ||--o{ RideStatusHistory : "audited by (Cascade)"
```