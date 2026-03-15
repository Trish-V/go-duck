# GO-DUCK CLI

<p align="center">
  <img src="https://goduck.theheavenscode.com/logo.png" alt="Go-Duck Logo" width="200"/>
</p>

<h1 align="center">GO-DUCK: The Evolutionary Architecture Factory</h1>

<p align="center">
  Where high-velocity Gophers meet the versatile wisdom of the Duck to scaffold microservices that thrive in chaos.
</p>

<p align="center">
  <a href="https://badge.fury.io/js/go-duck-cli"><img src="https://badge.fury.io/js/go-duck-cli.svg" alt="npm version"></a>
  <a href="https://opensource.org/licenses/ISC"><img src="https://img.shields.io/badge/License-ISC-blue.svg" alt="License: ISC"></a>
</p>

---

## 🦆 The Legend of the Century

[Watch the intro video](https://goduck.theheavenscode.com/intro.mp4)

In the legendary Silicon Valley of Code, a nomadic Gopher—lightning-fast and known for his tireless concurrency—crossed paths with a Duck from the Great Persistence Bayou. The Duck held the wisdom of adaptability and the secret to navigating ever-shifting business tides. They realized that while the Gopher built fast, the Duck built to survive. Together, they forged a pact to create the **Generator of Kings**.

### Gin Gonic Tonic: The Refreshment of Performance

To fuel their grand design, they sought the Legendary Bottle of Gin. This magical brew wasn't just for hydration; it transformed their web routing into a crystalline, high-performance flow. Routes became fast, middleware became transparent, and the developer experience became as refreshing as a cold tonic on a summer's day. This gave **GO-DUCK** its distinctive, lightweight spirit.

<p align="center">
  <img src="https://goduck.theheavenscode.com/gin_bottle.png" alt="Go-Duck Feature 1" width="400"/>
</p>

### The Armor of the Divine: Mark of Kratos

But speed without strength is a house made of cards. In the digital forge of the underworld, they recovered the Mark of Kratos. By stamping this sigil onto their internal services, they achieved gRPC industrial resilience. Every service became armored with strict Protocol Buffer contracts, ensuring that no matter how hard the system scaled, it would never break under the divine weight of technical debt.

<p align="center">
  <img src="https://goduck.theheavenscode.com/kratos_mark.png" alt="Go-Duck Feature 2" width="400"/>
</p>

### The GDL Genesis

Thus, the **GDL (Go-Duck Language)** was hatched. A single, simple tongue that could command entire legions of code. From that day forth, every developer who whispered GDL into the CLI would see their architecture evolve—bringing the Gopher's speed, the Duck's wisdom, the Gin's clarity, and the Kratos' strength into a single, unified masterpiece.

## ✨ Features Overview (The 260% Milestone)

*   **Full-Stack Code Generation**: Generates everything from REST and gRPC (Kratos) APIs to the internal repository layer.
*   **Dual-Protocol APIs**: Multi-protocol support (Gin/REST & Kratos/gRPC) with OIDC/JWT security enforcement.
*   **Dynamic Multi-Tenancy**: Side-by-side **Database-pet-Tenant isolation** with Hot-Swapping Connection Pools and a verified Master-Tenant Registry.
*   **High-Velocity Bulk Operations**: Transactional `BulkCreate`, `BulkUpdate`, and `BulkPatch` endpoints for all entities.
*   **Deep JSON Querying**: PostgREST-like RPC engine supporting arrow operators (`->`, `->>`) for complex JSONB searches.
*   **Stateful Incremental Updates**: Intelligently applies schema deltas to your existing codebase without data loss.
*   **Rich Ecosystem Components**:
    *   **Persistence**: GORM (PostgreSQL) + Liquibase migrations.
    *   **GraphQL**: Full schema and resolver generation.
    *   **Real-time**: Traced WebSocket envelopes & MQTT notifications.
    *   **Resilience**: Circuit Breakers (Sony/Gobreaker) & Rate Limiting.
    *   **Observability**: Full-stack tracing (Otelgin to Otelpgx) + Prometheus metrics.
*   **Gorgeous Automated Documentation**: Auto-scaffolded "Apple-style" Developer Guide and High-Fidelity Swagger UI.

## 💾 Global Installation

To get started with GO-DUCK CLI, install it globally via npm:

```bash
npm install -g go-duck-cli
```

### Environment Specifications

Ensure your development environment meets the following requirements:

*   **Node.js:** 18+
*   **Go:** 1.21+
*   **Docker:** v20+
*   **Composability:** v2+

## 🚀 Scaffold & Run

Follow these steps to create and run a new microservice with GO-DUCK:

```bash
# 1. Create a new microservice
go-duck create -o ./my-app -c config.yaml

# 2. Enter the application directory and run
cd my-app
docker-compose up -d
go run main.go
```

## Usage

The `go-duck-cli` has two main commands: `create` and `import-gdl`.

### `go-duck create`

This command scaffolds a new Go microservice.

```bash
go-duck create [options]
```

**Options:**

*   `-c, --config <path>`: Path to the `config.yaml` file (default: `../CONFIG/config.yaml`).
*   `-o, --output <path>`: Path where the project will be generated (default: current directory).
*   `-g, --gdl <path>`: Path to the directory containing your GDL files (default: `../GDL`).

**Example:**

```bash
go-duck create -c my-app/config.yaml -o my-app -g my-app/gdl
```

### `go-duck import-gdl <file>`

This command imports a GDL file to an existing project, generating new entities, updating existing ones, and creating database migrations.

```bash
go-duck import-gdl <file> [options]
```

**Options:**

*   `-o, --output <path>`: Path to the existing application root (default: current directory).

**Example:**

```bash
go-duck import-gdl new-entities.gdl -o my-existing-app
```

## GoDuck Definition Language (GDL)

GDL is a simple language for defining your application's entities, fields, and relationships.

**Example (`app.gdl`):**

```gdl
entity Author {
  name String required
  email String unique
}

entity Book {
  title String required
  publishedDate LocalDate
}

relationship OneToMany {
  Author{books} to Book{author}
}
```

## Configuration (`config.yaml`)

The `config.yaml` file contains the configuration for your generated application.

```yaml
app:
  name: my-app
  datasource:
    host: localhost
    port: 5432
    username: user
    password: password
    database: my_app_db
  multitenancy:
    enabled: true
  security:
    jwt:
      secret: "your-jwt-secret"
```

## License

This project is licensed under the ISC License.
