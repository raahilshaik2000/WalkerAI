-- Active GC managers coordinate material sourcing, so supplier shipment and
-- delivery updates should reach the GC material workspace too.

CREATE OR REPLACE FUNCTION public.notify_material_order_fulfillment_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project record;
  v_material_item text;
  v_type text;
  v_message text;
  v_company_user_ids uuid[];
  v_gc_user_ids uuid[];
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'processing' AND NEW.status = 'shipped')
    OR (OLD.status = 'shipped' AND NEW.status = 'delivered')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT p.id, p.homeowner_id
  INTO v_project
  FROM public.projects p
  WHERE p.id = NEW.project_id;

  IF v_project.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT m.item
  INTO v_material_item
  FROM public.materials m
  WHERE m.id = NEW.material_id;

  IF NEW.status = 'shipped' THEN
    v_type := 'order_shipped';
    v_message := COALESCE(v_material_item, 'Material order') || ' has shipped'
      || CASE WHEN NEW.tracking_number IS NOT NULL THEN '. Tracking: ' || NEW.tracking_number ELSE '.' END;
  ELSE
    v_type := 'order_delivered';
    v_message := COALESCE(v_material_item, 'Material order') || ' was marked delivered. Confirm receipt to release supplier payment.';
  END IF;

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (
    v_project.homeowner_id,
    v_type,
    jsonb_build_object(
      'project_id', NEW.project_id,
      'order_id', NEW.id,
      'material_id', NEW.material_id,
      'material_item', v_material_item,
      'tracking_number', NEW.tracking_number,
      'carrier', NEW.carrier,
      'message', v_message,
      'deep_link', '/(homeowner)/project/' || NEW.project_id || '/materials'
    )
  );

  SELECT ARRAY(
    SELECT DISTINCT c.user_id
    FROM public.companies c
    WHERE c.user_id IS NOT NULL
      AND (
        c.id = (
          SELECT p.assigned_company_id
          FROM public.projects p
          WHERE p.id = NEW.project_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.project_slots ps
          WHERE ps.project_id = NEW.project_id
            AND ps.assigned_company_id = c.id
            AND ps.status IN ('filled', 'scheduled')
        )
      )
  )
  INTO v_company_user_ids;

  IF COALESCE(array_length(v_company_user_ids, 1), 0) > 0 THEN
    INSERT INTO public.notifications (user_id, type, payload)
    SELECT
      company_user.user_id,
      v_type,
      jsonb_build_object(
        'project_id', NEW.project_id,
        'order_id', NEW.id,
        'material_id', NEW.material_id,
        'material_item', v_material_item,
        'tracking_number', NEW.tracking_number,
        'carrier', NEW.carrier,
        'message', v_message,
        'deep_link', '/(company)/job/' || NEW.project_id || '/materials'
      )
    FROM unnest(v_company_user_ids) AS company_user(user_id);
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT gc.user_id
    FROM public.general_contractor_projects gcp
    JOIN public.general_contractors gc ON gc.id = gcp.general_contractor_id
    WHERE gcp.project_id = NEW.project_id
      AND gcp.status = 'active'
      AND gc.user_id IS NOT NULL
      AND gc.user_id <> v_project.homeowner_id
      AND NOT (gc.user_id = ANY(COALESCE(v_company_user_ids, ARRAY[]::uuid[])))
  )
  INTO v_gc_user_ids;

  IF COALESCE(array_length(v_gc_user_ids, 1), 0) > 0 THEN
    INSERT INTO public.notifications (user_id, type, payload)
    SELECT
      gc_user.user_id,
      v_type,
      jsonb_build_object(
        'project_id', NEW.project_id,
        'order_id', NEW.id,
        'material_id', NEW.material_id,
        'material_item', v_material_item,
        'tracking_number', NEW.tracking_number,
        'carrier', NEW.carrier,
        'message', v_message,
        'deep_link', '/(general-contractor)/project/' || NEW.project_id || '/materials'
      )
    FROM unnest(v_gc_user_ids) AS gc_user(user_id);
  END IF;

  RETURN NEW;
END;
$$;
