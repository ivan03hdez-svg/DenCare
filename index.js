const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const bcrypt = require("bcrypt");

//Instancia de Express
const app = express();
//Datos para el hasheo de contraseñas
const saltRounds = 10;
const PORT = process.env.PORT || 3000;

//Permitir la interpretacion de JSON en las solicitudes
app.use(express.json());

// Configuración de CORS
app.use(cors({
    origin: 'http://localhost:5173', // Cambia esto al dominio de tu frontend
    methods: 'GET,POST,PUT,DELETE',
    allowedHeaders: 'Content-Type',
}));

//mysql://root:qtVcwAfqztQfpeMLIEQmxlJFcHMojlRK@autorack.proxy.rlwy.net:38940/railway

//Configuracion de la conexion a la BD
const db = mysql.createConnection({
  host: "autorack.proxy.rlwy.net",
  user: "root",
  password: "qtVcwAfqztQfpeMLIEQmxlJFcHMojlRK",
  database: "railway",
  port: 38940,
}).promise(); //.promise() habilita Promises en las consultas

// Función de hash
async function hashPassword(password) {
  return await bcrypt.hash(password, saltRounds);
}

//Conexion a la BD
db.connect((err) => {
  if (err) {
    console.log("Error en la conexion: " + err.stack);
    return;
  } else {
    console.log("Conexion Exitosa a la BD");
  }
});

//AGREGAR USUARIOS
app.post("/RegistroUsuarios", async (req, res) => {
  const {
    Nombre,
    APaterno,
    AMaterno,
    GeneroId,
    FecNac,
    Telefono,
    Email,
    Password,
  } = req.body;
  try{
    //Verificar si ya existe el usuario
    const sqlCheckUsuario = "SELECT 1 FROM Tbl_Usuarios u WHERE u.Usuario_Email = ?";
    const [existingUser] = await db.query(sqlCheckUsuario, [Email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }
    await db.beginTransaction(); //Inicia la transacción
    //Hasheo de contraseña
    const hashedPassword = await hashPassword(Password);
    //Insert en la tbl_Usuarios
    const sqlUsuario = `INSERT INTO Tbl_Usuarios(Usuario_TipoUsuarioId, Usuario_Password, Usuario_Email, Usuario_Status) VALUES (2,?,?,1)`;
    const [usuarioResult] = await db.query(sqlUsuario, [hashedPassword,Email]);
    //Se obtiene el id ingresado
    const UserId = usuarioResult.insertId;
    //Insert en Tbl_Persona
    const sqlPersona = `INSERT INTO Tbl_Persona (Persona_Nombre, Persona_APaterno, Persona_AMaterno, Persona_GeneroId, Persona_FecNac, Persona_Telefono, Persona_UsuarioId, Persona_Status) 
                        VALUES (?,?,?,?,?,?,?,1)`;
    await db.query(sqlPersona, [Nombre, APaterno, AMaterno, GeneroId, FecNac, Telefono, UserId]);
    //Insert en Tbl_Pacientes
    const sqlPaciente = `INSERT INTO Tbl_Pacientes (Paciente_UsuarioId, Paciente_Status) VALUES (?,1)`;
    await db.query(sqlPaciente, [UserId]);
    //Se hacen las inserciones
    await db.commit();
    res.status(200).json({ success: true, message: "Usuario registrado exitosamente" }); //Registro correctamente
  }catch(error){
    await db.rollback();
    console.error("Error en registro:", error);
    res.status(500).json({ error: "Error al registrar el usuario" });
  }
});

//LOGIN
app.post("/Login", async (req, res) => {
  const { Email, Password } = req.body;
  const query = `SELECT p.PersonaId, p.Persona_UsuarioId, u.Usuario_Password, p.Persona_Nombre, ct.Rol_Nombre FROM Tbl_Usuarios u INNER JOIN Tbl_Persona p 
                  ON u.UsuarioId = p.Persona_UsuarioId INNER JOIN Tbl_Cat_Rol ct ON ct.RolId = u.Usuario_TipoUsuarioId WHERE Usuario_Email = ?`;
  try{
    const [results] = await db.query(query, [Email]);
    if (results.length === 0) {  //Si el usuario no existe
      return res.status(400).json({ error: "Usuario no encontrado" });
    }
    const user = results[0];
    // Comparación de contraseñas
    const isMatch = await bcrypt.compare(Password, user.Usuario_Password);
    if (!isMatch) {
      return res.status(401).json({ error: "Contraseña incorrecta" });
    }
    res.json({
      success: true,
      UsuarioId: user.Persona_UsuarioId,
      Nombre: user.Persona_Nombre,
      Rol: user.Rol_Nombre,
    });
  }catch(error){
    return res.status(500).json({ error: "Error al procesar la solicitud" });
  }
});

//OBTENER TODOS LOS USUARIOS
app.get("/obtenerUsuarios", async (req, res) => {
  const query = `SELECT CONCAT(p.Persona_Nombre,' ',p.Persona_APaterno,' ',p.Persona_AMaterno) AS Nombre, g.Genero_Nombre AS Genero, DATE_FORMAT(Persona_FecNac, '%d-%m-%Y') AS Nacimiento,
                  p.Persona_Telefono AS Telefono, u.Usuario_Email AS Correo, r.Rol_Nombre AS Tipo
                  FROM Tbl_Persona p INNER JOIN Tbl_Usuarios u ON p.Persona_UsuarioId = u.UsuarioId
                  INNER JOIN Tbl_Cat_Generos g ON p.Persona_GeneroId = GeneroId
                  INNER JOIN Tbl_Cat_Rol r ON u.Usuario_TipoUsuarioId = RolId`;
  try{
    const [results] = await db.query(query);
    res.json(results);
  }catch(error){
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

//OBTENER ODONTOLOGOS
app.get("/obtenerMedicos", async (req, res) => {
  const query = `SELECT m.MedicoId, p.Persona_Nombre FROM Tbl_Medicos m INNER JOIN Tbl_Usuarios u ON m.Medico_UsuarioId = u.UsuarioId 
                  INNER JOIN Tbl_Persona p ON p.Persona_UsuarioId = u.UsuarioId;`;
  try{
    const [results] = await db.query(query);
    res.json(results);
  }catch(error){
    res.status(500).json({ error: "Error al obtener los medicos" });
  }
});

//OBTENER DATOS DE USUARIO POR ID
app.get("/obtenerUsuariosById/:id", async (req, res) => {
  const usuarioId = req.params.id; // Obtener el ID desde los parámetros de la URL
  const query = `SELECT CONCAT(p.Persona_Nombre,' ',p.Persona_APaterno,' ',p.Persona_AMaterno) AS Nombre, g.Genero_Nombre AS Genero, DATE_FORMAT(Persona_FecNac, '%d-%m-%Y') AS Nacimiento,
                  p.Persona_Telefono AS Telefono, u.Usuario_Email AS Correo, u.Usuario_Password AS Contraseña, r.Rol_Nombre AS Tipo
                  FROM Tbl_Persona p INNER JOIN Tbl_Usuarios u ON p.Persona_UsuarioId = u.UsuarioId
                  INNER JOIN Tbl_Cat_Generos g ON p.Persona_GeneroId = GeneroId
                  INNER JOIN Tbl_Cat_Rol r ON u.Usuario_TipoUsuarioId = RolId
                  WHERE u.UsuarioId = ?`;
  try{
    const [results] = await db.query(query, [usuarioId]);
    if(results.length === 0){
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    res.json(results);
  }
  catch(error){
    return res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

//MODIFICAR DATOS DE USUARIO
app.post("/ModificarUsuario", async (req, res) => {
  const {
    UsuarioId,
    NewTelefono,
    NewCorreo,
    NewPassword,
  } = req.body;
  try{
    await db.beginTransaction();

    if(NewPassword){
      const NewHashedPass = await hashPassword(NewPassword); //Hasheo de contraseña
      const sqlUUsuario = `UPDATE Tbl_Usuarios SET Usuario_Password = ?, Usuario_Email = ? WHERE UsuarioId = ?`;
      await db.query(sqlUUsuario, [NewHashedPass,NewCorreo,UsuarioId])
    }else{
      const sqlUUsuario = `UPDATE Tbl_Usuarios SET Usuario_Email = ? WHERE UsuarioId = ?`;
      await db.query(sqlUUsuario, [NewCorreo,UsuarioId])
    }
    const buscarUsuario = `SELECT p.PersonaId FROM Tbl_Persona p INNER JOIN Tbl_Usuarios u ON p.Persona_UsuarioId = u.UsuarioId WHERE u.UsuarioId = ?`;
    const [rows] = await db.query(buscarUsuario, [UsuarioId]);
    const personaId = rows[0]?.PersonaId;
    if(!personaId){
      return res.status(404).json({ error: "Persona no encontrado" });
    }
    const sqlUPersona = `UPDATE Tbl_Persona SET Persona_Telefono = ? WHERE personaId = ?`;
    await db.query(sqlUPersona, [NewTelefono,personaId])

    await db.commit(); //Commit para realizar el UPDATE
    res.status(200).json({ succes: true, message: "Datos modificados correctamente"});
  }catch(error){
    await db.rollback();
    res.status(500).json({ error: "Error al modificar usuario" });
  }
});

//GENERAR CITA
app.post("/generarCita", async (req, res) => {
  const { 
    usuarioId, 
    fecha, 
    hora,
    servicioId
  } = req.body;
  const buscarUsuario = `SELECT PacienteId FROM Tbl_Usuarios u INNER JOIN Tbl_Pacientes p ON p.Paciente_UsuarioId = u.UsuarioId WHERE u.UsuarioId = ?`;
  try{
    const [rows] = await db.query(buscarUsuario, [usuarioId]);
    const pacienteId = rows[0]?.PacienteId;
    if(!pacienteId){
      return res.status(404).json({ error: "Paciente no encontrado" });
    }
    const Cita = `INSERT INTO Tbl_Citas (Cita_PacienteId, Cita_MedicoId, Cita_Fecha, Cita_Hora, Cita_ServicioId, Cita_EstadoId) VALUES (?,1,?,?,?,3)`;
    await db.query(Cita, [pacienteId, fecha, hora, servicioId, 3]);
    res.status(200).json({ succes:true, message: "Cita realizada" });
  }catch(error){
    await db.rollback();
    res.status(500).json({ error: "Error al ralizar la cita" });
  }
});

//OBTENER CITAS POR ID DE USUARIO
app.get("/obtenerCitasByUsuarioId/:UsuarioId", async (req, res) => {
  const UsuarioId = req.params.UsuarioId;
  const buscarUsuario = `SELECT PacienteId FROM Tbl_Usuarios u INNER JOIN Tbl_Pacientes p ON p.Paciente_UsuarioId = u.UsuarioId WHERE u.UsuarioId = ?`;
  const [rows] = await db.query(buscarUsuario, [UsuarioId]);
  const pacienteId = rows[0]?.PacienteId;
  if(!pacienteId){
    return res.status(404).json({ error: "Paciente no encontrado" });
  }
  const query = `SELECT per.Persona_Nombre,DATE_FORMAT(c.Cita_Fecha, '%d-%m-%Y') AS Cita_Fecha, DATE_FORMAT(c.Cita_Hora, '%H:%i') AS Cita_Hora FROM Tbl_Citas c 
                  INNER JOIN Tbl_Pacientes p ON c.Cita_PacienteId = p.PacienteId INNER JOIN Tbl_Medicos m ON c.Cita_MedicoId = m.MedicoId 
                  INNER JOIN Tbl_Usuarios u ON m.Medico_UsuarioId = u.UsuarioId INNER JOIN Tbl_Persona per ON per.Persona_UsuarioId = u.UsuarioId 
                  WHERE p.PacienteId = ?`;
  try{
    const [results] = await db.query(query, [pacienteId]);
    if(results.length === 0){
      return res.status(404).json({ error: "No cuentas con citas por el momento"});
    }
    res.json(results);
  }catch(error){
    return res.status(500).json({error : "Error al obtener las citas"})
  }
});

//ENVIAR MENSAJE
app.post('/enviarMsj', async (req, res) => {
  const { 
    remitenteId, 
    destinatarioId, 
    mensaje 
  } = req.body;

  if (!mensaje) {
    return res.status(400).send({ success: false, message: 'No puede estar vacio' });
  }
  
  const sqlEnviar = 'INSERT INTO Tbl_Mensajes (Mensaje_RemitenteId, Mensaje_DestinatarioId, Mensaje_Text, Mensaje_FecEnvio) VALUES (?, ?, ?, NOW())';
try {
    const [result] = await db.query(sqlEnviar, [emisor_id, receptor_id, mensaje]);
    res.send({ success: true, message: 'Mensaje enviado con éxito.', mensaje_id: result.insertId });
  } catch (error) {
    await db.rollback();
    res.status(500).json({ success: false, message: 'Error al enviar el mensaje.' });
  }
});

//LEER EL MENSAJE
app.post('/leerMsj', async (req, res) => {
  const { 
    usuario_id, 
    tipo //enviados o recibidos
  } = req.body;
  if (!usuario_id || !tipo) {
    return res.status(400).send({ success: false, message: 'Faltan parámetros.' });
  }
  let sqlLeerMensajes;
  if (tipo === 'enviados') {
    sqlLeerMensajes = `SELECT u_emisor.Usuario_User AS Envia, u_receptor.Usuario_User AS Recibe, m.Mensaje_Text AS Mensaje, m.Mensaje_FecEnvio AS Fecha 
                      FROM Tbl_Mensajes m INNER JOIN Tbl_Usuarios u_emisor ON m.Mensaje_RemitenteId = u_emisor.UsuarioId 
                      INNER JOIN Tbl_Usuarios u_receptor ON m.Mensaje_DestinatarioId = u_receptor.UsuarioId WHERE Mensaje_RemitenteId = ?`;
  } else if (tipo === 'recibidos') {
    sqlLeerMensajes = `SELECT u_emisor.Usuario_User, u_receptor.Usuario_User, m.Mensaje_Text, m.Mensaje_FecEnvio FROM Tbl_Mensajes m 
                        INNER JOIN Tbl_Usuarios u_emisor ON m.Mensaje_RemitenteId = u_emisor.UsuarioId
                        INNER JOIN Tbl_Usuarios u_receptor ON m.Mensaje_DestinatarioId = u_receptor.UsuarioId WHERE Mensaje_DestinatarioId = ?`;
  } else {
    return res.status(400).send({ success: false, message: 'Tipo de mensaje inválido.' });
  }
  try {
    const [result] = await db.query(sqlLeerMensajes, [usuario_id]);
    res.send({ success: true, mensajes: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error al leer los mensajes.' });
  }
});

//VER EL HISTORIAL DE X USUARIO

//RECORDATORIO DE CITAS



//INICIAR EL SERVIDOR
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

//EVENTO PARA CERRAR LA CONEXION
process.on("SIGINT", () => {
  db.end((err) => {
    if (err) {
      console.log("Error al cerrar la conexion; " + err.stack);
    }
    console.log("Conexion Cerrada Correctamente");
    process.exit();
  });
});