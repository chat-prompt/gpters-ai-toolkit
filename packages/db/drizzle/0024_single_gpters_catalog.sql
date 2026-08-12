-- AI Toolkit is an internal-only product. Keep legacy columns for client compatibility,
-- but normalize every catalog row to the single GPTers organization.
DO $$
DECLARE
  gpters_org_count integer;
BEGIN
  SELECT count(*) INTO gpters_org_count
  FROM organizations
  WHERE slug = 'gpters' AND is_active = true;

  IF gpters_org_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one active GPTers organization, found %', gpters_org_count;
  END IF;
END $$;

UPDATE catalog_items
SET org_id = (SELECT id FROM organizations WHERE slug = 'gpters' AND is_active = true),
    visibility = 'public'
WHERE org_id IS DISTINCT FROM (SELECT id FROM organizations WHERE slug = 'gpters' AND is_active = true)
   OR visibility IS DISTINCT FROM 'public';

ALTER TABLE catalog_items ALTER COLUMN visibility SET DEFAULT 'public';

CREATE OR REPLACE FUNCTION enforce_single_gpters_catalog()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  gpters_org_id text;
BEGIN
  SELECT id INTO STRICT gpters_org_id
  FROM organizations
  WHERE slug = 'gpters' AND is_active = true;

  NEW.org_id := gpters_org_id;
  NEW.visibility := 'public';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS catalog_items_single_gpters_org ON catalog_items;
CREATE TRIGGER catalog_items_single_gpters_org
BEFORE INSERT OR UPDATE OF org_id, visibility ON catalog_items
FOR EACH ROW
EXECUTE FUNCTION enforce_single_gpters_catalog();
