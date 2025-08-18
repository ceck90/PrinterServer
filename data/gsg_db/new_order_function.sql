CREATE OR REPLACE FUNCTION notify_new_order()
            RETURNS TRIGGER AS $$
            BEGIN
                PERFORM pg_notify('new_order', json_build_object(
                    'operation', TG_OP,
                    'item', row_to_json(NEW)
                )::text);
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;

            CREATE TRIGGER plate_orders_trigger
            AFTER INSERT ON plate_orders
            FOR EACH ROW EXECUTE FUNCTION notify_new_order();