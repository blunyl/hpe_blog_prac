/*express, ejs, mongodb, .env 초기설정 + multer */ 
require('dotenv').config()

const express = require('express')
const app = express();//express 작동
const port = process.env.PORT;

//img, multer 설정
const multer = require('multer');
const path = require('path');
const fs = require('fs')
const uploadDir = 'public/uploads/';

/* 이미지 경로가 없으면 폴더를 만들어라, 부모 디렉토리가 없을 경우 상위 디렉토리도 생성하게 true 설정  */
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true})

app.set('view engine', 'ejs');
app.use(express.static('public'))

/* express 요청 본문을 파싱하게 해준다->  log(req.body)로 확인*/
app.use(express.json())
app.use(express.urlencoded({extended:true}))

/*mongodb + dotenv */
const { MongoClient } = require('mongodb'); 
const uri = process.env.MONGODB_URL;
const client = new MongoClient(uri);

const getDB = async ()=>{
  await client.connect();//db에 연결
  return client.db('blog2')//blog 디비에 연결할거다
}

// multer 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // 파일 저장 경로 지정
},
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)); // 파일 이름 설정
  }
});

const upload = multer({ storage: storage });

/***** 라우팅******/
app.get("/", async (req, res)=>{
  try {
    const db = await getDB()
    const posts = await db.collection('posts').find().toArray()
    res.render('index', { posts })    
  } catch (error) {
    console.error(error)
  }
})

app.get("/write", (req, res)=>{
  res.render('write')
})

app.post("/write", upload.single('postimg'), async  (req, res)=>{
  console.log(req.body);
  /*log에서 찍은 애들 키값 그대로 넣기 */
  const {title, content, createAtDate} = req.body
  const postImg = req.file ? req.file.filename : null;

  /*카운터콜렉션에 들어가서 카운터 있는걸 찾아서 
  결과값 토탈포스트 에 1를 붙여서 아이디값 생성 */
  try {
    const db = await getDB();
    const result = await db.collection('counter').findOne({name:'counter'})
    await db.collection('posts').insertOne({ 
      _id: result.totalPost +1, title, content, createAtDate, 
      postImgPath: postImg ? `uploads/${postImg}` : null,
     })
    /* 1을 증가시켰으니 원래 있던 totalPost도 1을 증가시켜야한다  */
    await db.collection('counter').updateOne( {name:'counter'}, {$inc:{totalPost: 1}} )
    res.redirect("/")
  } catch (e) {
    console.error(e);
  }
})

app.listen(port, ()=>{
  console.log('server!', port);
})