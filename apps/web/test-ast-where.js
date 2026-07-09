const { Parser } = require("node-sql-parser");
const parser = new Parser();
const sql = `
SELECT 
    p1.name,
    p1.category_id,
    p1.rating
FROM Products p1
WHERE (
    SELECT COUNT(*)
    FROM Products p2
    WHERE p2.category_id = p1.category_id
    AND p2.rating > p1.rating
) <= 2
ORDER BY p1.category_id, p1.rating DESC;
`;
const ast = parser.astify(sql);
console.log(JSON.stringify(ast, null, 2));
