-- Run this script once to set up the database schema.
-- Usage: mysql -u root -p < schema.sql
-- NOTE: If upgrading an existing database, run these migrations manually first:
--   ALTER TABLE slots DROP FOREIGN KEY IF EXISTS slots_ibfk_2;
--   ALTER TABLE slots DROP COLUMN IF EXISTS unit_id;
--   ALTER TABLE slots DROP COLUMN IF EXISTS equipment_id;
--   ALTER TABLE slots ADD COLUMN IF NOT EXISTS software_version_id INT NOT NULL AFTER id;
--   ALTER TABLE slots ADD COLUMN IF NOT EXISTS image_original_name VARCHAR(255) AFTER position;
--   ALTER TABLE slots ADD COLUMN IF NOT EXISTS image_stored_name VARCHAR(255) AFTER image_original_name;
--   DROP TABLE IF EXISTS unit_options;
--   DROP TABLE IF EXISTS units;
--   ALTER TABLE hardware_trees ADD COLUMN IF NOT EXISTS version_to VARCHAR(100) DEFAULT NULL AFTER software_version;

CREATE DATABASE IF NOT EXISTS config_backup CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE config_backup;

CREATE TABLE IF NOT EXISTS equipment (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  model       VARCHAR(255),
  description TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS software_versions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  equipment_id     INT NOT NULL,
  version          VARCHAR(100) NOT NULL,
  previous_version VARCHAR(100),
  notes            TEXT,
  changed_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS slots (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  software_version_id INT NOT NULL,
  name                VARCHAR(255) NOT NULL,
  position            INT NOT NULL DEFAULT 0,
  image_original_name VARCHAR(255),
  image_stored_name   VARCHAR(255),
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (software_version_id) REFERENCES software_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS backup_files (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  equipment_id  INT NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  size_bytes    BIGINT,
  is_current    TINYINT(1) DEFAULT 1,
  uploaded_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hardware_trees (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  model            VARCHAR(255) NOT NULL,
  software_version VARCHAR(100) NOT NULL,
  version_to       VARCHAR(100) DEFAULT NULL,
  notes            TEXT,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_tree (model, software_version)
);

CREATE TABLE IF NOT EXISTS hardware_nodes (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  hardware_tree_id INT NOT NULL,
  parent_id        INT DEFAULT NULL,
  name             VARCHAR(255) NOT NULL,
  description      TEXT,
  address_dec      INT DEFAULT NULL,
  address_hex      VARCHAR(20) DEFAULT NULL,
  position         INT NOT NULL DEFAULT 0,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (hardware_tree_id) REFERENCES hardware_trees(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id)        REFERENCES hardware_nodes(id)  ON DELETE CASCADE
);
