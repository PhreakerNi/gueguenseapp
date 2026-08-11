-- Migration 1: Extensions & Private Schema Setup
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgtap" WITH SCHEMA extensions;

-- Private schema (Inaccessible to anon/authenticated client roles)
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
