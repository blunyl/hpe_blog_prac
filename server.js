/*express, ejs, mongodb, .env 초기설정 + multer */ 
require('dotenv').config()

const express = require('express')
const app = express();//express 작동
const port = process.env.PORT;

app.set('view engine', 'ejs');
app.use(express.static('public'))

/* express 요청 본문을 파싱하게 해준다-> log(req.body)로 확인*/
app.use(express.json())
app.use(express.urlencoded({extended:true}))

//img, multer 설정
const multer = require('multer');
const path = require('path');
const fs = require('fs')
const uploadDir = 'public/uploads/';

/* 이미지 경로가 없으면 폴더를 만들어라, 부모 디렉토리가 없을 경우 상위 디렉토리도 생성하게 true 설정  */
if(!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true})

// methodOverride
const methodOverride = require('method-override')
app.use(methodOverride('_method'))

//bcrypt
const bcrypt = require('bcrypt');
const saltRounds = 10;

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
  /*log에서 찍은 애들 키값 그대로 몽고디비에 넣기 */
  const {title, content, createAtDate} = req.body; 
  /* write에서 적은 애들이 form 을 타고 여기로 들어옴 */
  const postImg = req.file ? req.file.filename : null;

  /*카운터콜렉션에 들어가서 카운터 있는걸 찾아서 
  결과값 토탈포스트 에 1를 붙여서 아이디값 생성 */
  try {
    const db = await getDB();
    const result = await db.collection('counter').findOne({name:'counter'})
    await db.collection('posts').insertOne({ 
      _id: result.totalPost +1, title, content, createAtDate, 
      postImgPath: postImg ? `/uploads/${postImg}` : null,
    })
    /* 1을 증가시켰으니 원래 있던 totalPost도 1을 증가시켜야한다  */
    await db.collection('counter').updateOne( { name:'counter' }, { $inc:{totalPost: 1} } )
    res.redirect("/")
  } catch (e) {
    console.error(e);
  }
})

app.get("/detail/:id", async(req,res)=>{
  // console.log(req.params.id);
  let id = parseInt(req.params.id) //지금 찍히는 애는 문자, 몽고디비에 저장돼있는 id는 숫자
  try {
    const db = await getDB();
    const posts = await db.collection('posts').findOne({_id:id})
    res.render('detail', {posts})
  } catch (e) {
    console.error(e)
  }
})

app.post('/delete/:id', async (req, res)=>{
  let id = parseInt(req.params.id)
  try {
    const db = await getDB();
    await db.collection('posts').deleteOne({_id:id})
    res.redirect('/')
  } catch (e) {
    console.error(e)
  }
})

//수정페이지로 데이터 바인딩
app.get("/edit/:id", async (req, res)=>{
  let id = parseInt(req.params.id)
  try {
    const db = await getDB();
    const posts = await db.collection('posts').findOne({_id:id});
    res.render('edit', { posts })    
  } catch (e) {
    console.error(e)
  }
})

//실제 수정
app.post("/edit", upload.single('postimg'), async (res, req)=>{
  const { id, title, content, createAtDate } = req.body;
  const postImgOld = req.body.postImgOld.replace('uploads/','');
  const postImg = req.file ? req.file.filename : postImgOld; 
  /*edit 할 파일이 있으면 그걸쓰고 없으면 기존걸 (old) 쓴다 
  단, old가 postImg 로 들어가게 되면 /uploads/가 또 중복돼므로 
  따로 변수로 빼서 /uploads/ 를 제거해준다
  */

  try {
    const db = await getDB();
    await db.collection('posts').updateOne({_id:parseInt(id)},{
      $set : {
        title,
        content,
        createAtDate,
        postImgPath: postImg ? `/uploads/${postImg}` : null,
      }//{찾을애},{수정할애}
    })
    res.redirect('/')
  } catch (e) {
    console.error(e)
  }
});

app.get("/signup",(req,res)=>{
  res.render('signup')
})

app.post("/signup", async (req,res)=>{
  const { userid, pw, username } = req.body; 
  //몽고디비에 들어감 , 근데 비번은 암호화서 몽고디비에 넣어야 하니까 bcrypt 설치
  try{ 
    const db = await getDB();
    const hashedPw = await bcrypt.hash(pw, saltRounds) //비번 암호화, 로그인할떈 이걸 다시 꺼내서 쓰면 됨
    //users 컬렉션 새로 생성
    await db.collection('users').insertOne({userid, username, pw: hashedPw}) 
    res.redirect('/login')
  } catch(e){
    console.error(e)
  }
})

app.get('/login', (req, res)=>{
  res.render('login')
})

app.post("/login", async (req, res) => {
  const { userid, pw } = req.body; //가져올데이터

  try {
    const db = await getDB();
    const user = await db.collection("users").findOne({ userid });
    console.log("login data : ", req.body, user);

    if (user) {
      const compareResult = await bcrypt.compare(pw, user.pw);
      if (compareResult) {
        res.redirect("/");
      } else {
        res.status(401).send();
      }
    } else {
      res.status(404).send();
    }
  } catch (e) {
    console.error(e);
  }
});

app.listen(port, ()=>{
  console.log('server!', port);
})