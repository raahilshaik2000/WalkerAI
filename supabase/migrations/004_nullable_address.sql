-- Allow draft projects to be created without an address
-- Address is now collected at step 7 of the project creation wizard
ALTER TABLE projects ALTER COLUMN address DROP NOT NULL;
