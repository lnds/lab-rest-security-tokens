  // index.js
const express = require("express")
const app = express()
const cors = require("cors")
const pool = require("./db")
const swaggerUi = require('swagger-ui-express')
const swaggerFile = require('./swagger_output.json')

const { PORT, JWT_SECRET } = require('./config')


//middleware
app.use(cors())
app.use(express.json())

// JWT GENERATOR

const jwt = require("jsonwebtoken")

const jwtGenerator = (userId) => {
    // genera un token jwt para el usuario dado
    if (userId) {
        const payload = {
            user: userId,
        }
        return jwt.sign(payload, JWT_SECRET, { expiresIn: "1hr" })
    }
    return "invalid token"
}

// ENCRYPT PASSWORD

const bcrypt = require("bcrypt")

const encrypt = async (password) => {
    //  Encriptar password usand bCrypt
    const saltRounds = 10
    const salt = await bcrypt.genSalt(saltRounds)
    const bcryptPassword = await bcrypt.hash(password, salt)
    return bcryptPassword
}


// CHECK PASSWORD

const compare = async (plainPassword, password) => {
    return await bcrypt.compare(plainPassword, password)
}

// swagger doc
app.use('/doc', swaggerUi.serve, swaggerUi.setup(swaggerFile))



// registrar usuario
app.post("/users", async (req, res) => {
    // #swagger.description = 'Endpoint para registrar un nuevo usuario en la  plataforma'

    try {
        // 1. destructurar req.body para obtner (name, email, password)
        const { name, email, password } = req.body


        // 2. verificar si el usuario existe (si existe lanzar un error, con throw)
        const user = await pool.query("SELECT * FROM users WHERE email = $1", [email])

        if (user.rows.length !== 0) {
            return res.status(401).send("Usuario ya existe")
        }

        // 3. Encriptar password usand bCrypt
        bcryptPassword = await encrypt(password)

        // 4. agregar el usuario a la base de datos
        const newUser = await pool.query(
            "INSERT INTO users(name, email, password) values($1, $2, $3) RETURNING *",
            [name, email, bcryptPassword])

        token = jwtGenerator(newUser.rows[0].id)
        res.json({ token })
    } catch (err) {
        console.log(err)
        res.status(500).send("Server error")
    }
})

// verificar usuario
app.post("/login", async (req, res) => {
    // #swagger.description = 'Endpoint para obtener un token de sesión para el usuario'
    try {
        // 1. destructurizar req.body
        const { email, password } = req.body


        // 2. verificar si el usuario no existe (si no emitiremos un error)
        const user = await pool.query("SELECT * FROM users WHERE email = $1", [email])

        if (user.rows.length === 0) {
            return res.status(401).json("Password incorrecta o email no existe")
        }

        // 3. verificar si la clave es la misma que está almacenada en la base de datos
        const validPassword = await compare(password, user.rows[0].password)
        console.log("plain", password, user.rows[0].password)
        if (!validPassword) {
            return res.status(401).json("Password incorrecta o email no existe")
        }

        // 4. entregar un token jwt 
        const token = jwtGenerator(user.rows[0].id)
        res.json({ token })
    } catch (err) {
        console.log(err)
        res.status(500).send("Server error")
    }
})

// List all users
app.get("/users", async (req, res) => {
    // #swagger.description = 'Endpoint para listar todos los usuarios registrados en el sistema'
    try {
        const allUsers = await pool.query(
            "SELECT id, name, email FROM users"
        )
        res.json(allUsers.rows)
    } catch (err) {
        console.error(err.message)
        res.status(500).send("Server error")
    }
})

// Un middleware para validar JWT
const authorization = async (req, res, next) => {
    try {
        // 1. obtiene el token del header del request
        const jwToken = req.header("token")

        // 2. si no hay token presente es un error
        if (!jwToken) {
            return res.status(403).json("No autorizado")
        }

        // 3. valida el token y obtiene el payload, si falla tirará una excepción
        const payload = jwt.verify(jwToken, JWT_SECRET)

        // 4. rescatamos el payload y lo dejamos en req.user
        req.user = payload.user

        // 5. continua la ejecución del pipeline
        next()
    } catch (err) {
        console.error(err.message)
        return res.status(403).json("No autorizado")
    }
}

//crea una tarea
app.post("/tareas", authorization, async (req, res) => {
    // #swagger.description = 'Endpoint para listar todas las tareas que pertenecen al usuario registrado en el token de sesión
    try {
        const { description } = req.body
        const newTodo = await pool.query(
            "INSERT INTO tasks(description,user_id) VALUES($1, $2) RETURNING *",
            [description, req.user]
        )
        res.json(newTodo.rows[0])
    } catch (err) {
        console.error(err.message)
        res.status(500).send("server error")
    }
})

// obtiene todas las tareas 
app.get("/tareas", authorization, async (req, res) => {
    // #swagger.description = 'Endpoint para listar todas las tareas que pertenecen al usuario registrado en el token de sesión'
    try {
        const allTodos = await pool.query(
            "SELECT * FROM tasks WHERE user_id= $1 ORDER BY id",
            [req.user]
        )
        res.json(allTodos.rows)
    } catch (err) {
        console.error(err.message)
        res.status(500).send("server error")
    }
})

// obtiene una tarea especifica
app.get("/tareas/:id", authorization, async (req, res) => {
    // #swagger.description = 'Endpoint para obtener una tarea específica y que pertenezca al usuario registrado en el token de sesion'  
    try {
        const { id } = req.params
        const todo = await pool.query(
            "SELECT * FROM tareas WHERE id = $1 and user_id = $2",
            [id, req.user]
        )
        if (todo == null || todo.rows.length == 0) {
          res.status(404).send("tarea no encontrada")
        } else {
          res.json(todo.rows[0])
        }
    } catch (err) {
        console.log(err)
        res.status(500).send("server error")
    }
})

// actualiza una tarea
app.put("/tareas/:id", authorization, async (req, res) => {
  // #swagger.description = 'Endpoint para actualizar la descripción de una tarea especifica y que pertenezca al usuario registrado en el token de sesión
    try {
        const { id } = req.params
        const { description } = req.body
        const updateTodo = await pool.query(
            "UPDATE tasks SET description = $1 WHERE id = $2 and user_id = $3",
            [description, id, req.user]
        )
        console.log(updateTodo)
        res.json("tarea "+id+" actualizada")
    } catch (err) {
        console.log(err)
        res.status(500).send("server error")
    }
})

// borra una tarea
app.delete("/tareas/:id", authorization, async (req, res) => {
      // #swagger.description = 'Endpoint para borrar una tarea especifica y que pertenezca al usuario registrado en el token de sesión'
    try {
        const { id } = req.params
        const deleteTodo = await pool.query(
            "DELETE FROM tasks WHERE id = $1 and user_id = $2",
            [id, req.user]
        )
        console.log(deleteTodo)
        res.json("tarea "+id+" fue eliminada")
    } catch (err) {
        console.error(err)
        res.status(500).send("server error")
    }
})

app.listen(PORT, () => {
	console.log("servidor iniciado en puerto " + PORT)
})
