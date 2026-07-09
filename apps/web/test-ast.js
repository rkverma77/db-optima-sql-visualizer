const { Parser } = require("node-sql-parser");
const parser = new Parser();
const sql = `
SELECT 
    c.name,
    c.email,
    (SELECT SUM(p.price * o.quantity) 
     FROM Orders o 
     JOIN Products p ON o.product_id = p.id 
     WHERE o.customer_id = c.id) AS total_spent
FROM Customers c;
`;
const ast = parser.astify(sql);
console.log(JSON.stringify(ast, null, 2));
