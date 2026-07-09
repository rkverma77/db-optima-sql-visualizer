import { parsePipeline } from "./src/lib/sql/engine";

const queries = [
    // 1. Simple SELECT
    "SELECT * FROM Users WHERE age > 18;",
    
    // 2. Multiple JOINs
    "SELECT u.name, o.total, p.title FROM Users u JOIN Orders o ON u.id = o.user_id LEFT JOIN Products p ON o.product_id = p.id;",
    
    // 3. Subquery in WHERE
    "SELECT name FROM Users WHERE id IN (SELECT user_id FROM Orders WHERE total > 100);",
    
    // 4. Subquery in FROM
    "SELECT sub.name, sub.total FROM (SELECT u.name, SUM(o.total) as total FROM Users u JOIN Orders o ON u.id = o.user_id GROUP BY u.name) sub WHERE sub.total > 1000;",
    
    // 5. Subquery in SELECT
    "SELECT u.name, (SELECT COUNT(*) FROM Orders o WHERE o.user_id = u.id) as order_count FROM Users u;",
    
    // 6. Multiple CTEs
    "WITH HighRollers AS (SELECT user_id FROM Orders GROUP BY user_id HAVING SUM(total) > 1000), ActiveUsers AS (SELECT id FROM Users WHERE last_login > '2023-01-01') SELECT u.name FROM Users u JOIN HighRollers h ON u.id = h.user_id JOIN ActiveUsers a ON u.id = a.id;",
    
    // 7. Window Functions
    "SELECT name, salary, RANK() OVER(PARTITION BY department_id ORDER BY salary DESC) as dept_rank FROM Employees;",
    
    // 8. UNION
    "SELECT id, name FROM Customers UNION SELECT id, name FROM Suppliers;",
    
    // 9. CASE WHEN
    "SELECT name, CASE WHEN age < 18 THEN 'Minor' WHEN age >= 18 THEN 'Adult' ELSE 'Unknown' END as age_group FROM Users;",
    
    // 10. Correlated subquery in EXISTS
    "SELECT name FROM Customers c WHERE EXISTS (SELECT 1 FROM Orders o WHERE o.customer_id = c.id AND o.status = 'pending');",
    
    // 11. Subquery in JOIN condition
    "SELECT c.name, o.id FROM Customers c JOIN Orders o ON c.id = o.customer_id AND o.total > (SELECT AVG(total) FROM Orders);"
];

let success = 0;
let fail = 0;

for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    try {
        const steps = parsePipeline(q);
        console.log("✅ Query", i+1, "Parsed (", steps.length, "steps):", steps.map(s => s.type).join(' -> '));
        success++;
    } catch (e: any) {
        console.log("❌ Query", i+1, "Failed:", e.message);
        fail++;
    }
}

console.log("\\nResults: " + success + " succeeded, " + fail + " failed.");
