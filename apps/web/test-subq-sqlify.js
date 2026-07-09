const { Parser } = require("node-sql-parser");
const parser = new Parser();
const sql = `
SELECT c.country, sub.order_count 
FROM Customers c 
JOIN (SELECT customer_id, COUNT(id) as order_count FROM Orders GROUP BY customer_id) sub 
ON c.id = sub.customer_id
`;

const ast = parser.astify(sql);
if (ast.from) {
    for (const f of ast.from) {
        if (f.expr && f.expr.ast) {
            console.log("SQLIFY:", parser.sqlify(f.expr.ast));
        }
    }
}
