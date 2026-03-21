-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS car (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    model VARCHAR(255) NOT NULL,
    year INT ,
    price DECIMAL ,
    color VARCHAR(50) ,
    features JSONB ,
    created_by VARCHAR(255),
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_by VARCHAR(255),
    last_modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_user_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS person (
    id BIGSERIAL PRIMARY KEY,
    firstname VARCHAR(255) NOT NULL,
    lastname VARCHAR(255) ,
    email VARCHAR(255) UNIQUE,
    age INT ,
    preferences JSONB ,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS article (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL UNIQUE,
    content TEXT NOT NULL,
    status VARCHAR(50) NOT NULL,
    publisheddate DATE ,
    created_by VARCHAR(255),
    created_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_by VARCHAR(255),
    last_modified_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_modified_user_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS author (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS car CASCADE;
DROP TABLE IF EXISTS person CASCADE;
DROP TABLE IF EXISTS article CASCADE;
DROP TABLE IF EXISTS author CASCADE;
-- +goose StatementEnd
