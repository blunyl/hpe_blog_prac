/*express, ejs, mongodb, .env 초기설정 + multer 
설치 라이브러리들은 npm 참고하며 사용 */ 
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

// methodOverride
const methodOverride = require('method-override')
app.use(methodOverride('_method'))

//bcrypt
const bcrypt = require('bcrypt');
const saltRounds = 10;

/*jsonwebtoken 로그인 성공시 토큰 발행 
어떤 정보를 넣어서 발행할지 결정할 수 있음
쿠키에 토큰 저장 -> 토근 정보를 header.ejs 에 반영
로그아웃시 쿠키 삭제 
cookie-parser 쿠키를 파싱해서 정보를 저장
쿠키를 생성/삭제/데이터에 저장
*/
const jwt = require('jsonwebtoken');
const SECRET = process.env.SECRET_KEY //사용할 비밀키 아무렇게나 만듦(보안때문에 env에 저장)

const cookieParser = require('cookie-parser');
const { log } = require('console');
//app.use post,get 모든 요청사항의 경우 라이브러리를 불러온다음 미들웨어에 등록할때 사용 
app.use(cookieParser()) 

/*모든 요청의 쿠키를 검사 -> 로컬스토리지처럼 모든 요소에 반영되게 
토큰이 있다면 토큰을 해독해서 req.user 에 userid 를 저장 */
app.use( async (req, res, next) => {
  const token = req.cookies.token //쿠키에 암호화된 token 키값 데이터가 담김
  if(token) { //토큰이 있다면 로그인이 된거, 1)암호화된 토큰을 해석해서 2)그 유저정보를 몽고디비에서 찾아서 가지고와야함
    try {
      const data = jwt.verify(token, SECRET); //암호키로 해독
      const db = await getDB();
      const user = await db.collection('users').findOne({userid: data.userid})
      req.user = user ? user : null; //req.user 는 /login 에서 온 애들
    } catch (e) {
      console.error(e)
    }
  }
  next() //다음 미들웨어로 이동
})

/***** 라우팅******/
app.get("/", async (req, res)=>{
  try {
    const db = await getDB()
    const posts = await db.collection('posts').find().toArray()
    res.render('index', { posts, user:req.user })
    /*user 로그인된 정보도 보낸다 -> 헤더에 환영메시지 가능, 
    다만 헤더에만 가서 다른 get 요청 페이지들도 user처리해줘야됨 
    ->app.use쪽에 req.user 처리하고 get render 부분엔 req.user를 보내는 걸로 수정함
    */
  } catch (error) {
    console.error(error)
  }
})

app.get("/write", (req, res)=>{
  res.render('write', {user:req.user})
})

app.post("/write", upload.single('postimg'), async  (req, res)=>{
  const user = req.user ? req.user : null;
  console.log(req.body);
  /*log에서 찍은 애들 키값 그대로 몽고디비에 넣기 */
  const {title, content, createAtDate } = req.body; 
  /* write에서 적은 애들이 form 을 타고 여기로 들어옴 */
  const postImg = req.file ? req.file.filename : null;

  /*카운터콜렉션에 들어가서 카운터 있는걸 찾아서 
  결과값 토탈포스트 에 1를 붙여서 아이디값 생성 */
  try {
    const db = await getDB();
    const result = await db.collection('counter').findOne({name:'counter'})
    await db.collection('posts').insertOne({ 
      _id: result.totalPost +1, title, content, createAtDate, 
      userid: user.userid,
      username: user.username, //detail 페이지에 닉네임 바인딩하고싶을때 사용
      postImgPath: postImg ? `/uploads/${postImg}` : null,
    })
    /* 1을 증가시켰으니 원래 있던 totalPost도 1을 증가시켜야한다  */
    await db.collection('counter').updateOne( { name:'counter' }, { $inc:{totalPost: 1} } )
    await db.collection('like').insertOne({ post_id: result.totalPost +1, like: 0, likeMember: [] } )
    /* 글쓸때마다 좋아요 기본값 셋팅
    posts 컬렉션의 post_id와 like컬렉션의 post_id 값을 값게,
    like는 0 으로 초기화시서 글 쓸때마다 좋아요를 클릭한 사람이 없게,
    그리고 좋아요를 클릭한 사람이 나중에 들어가게 빈 배열 생성 */
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
    const like = await db.collection('like').findOne({post_id:id})
    res.render('detail', { posts, user:req.user, like })
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
    res.render('edit', { posts, user:req.user})    
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
  res.render('signup',{user:req.user})
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
  res.render('login', {user:req.user})
})

app.post("/login", async (req, res) => {
  const { userid, pw } = req.body; //가져올데이터(인풋에 입력된)

  try {
    const db = await getDB();
    const user = await db.collection("users").findOne({ userid });
    console.log("login page data : ", req.body, user);

    if (user) {
      const compareResult = await bcrypt.compare(pw, user.pw);
      if (compareResult) { //로그인이 된 경우->토큰 발행해야!!
        const token = jwt.sign({userid:user.userid}, SECRET); //userid 토큰 발행
        res.cookie('token', token); 
        /*실제 쿠키에 저장될 키값(로그인 성공후 토큰 발행한걸 
          token 이라는 이름의 키값으로 넣는다, id가 암호화돼서 들어감)*/
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

//로그아웃 쿠키안의 토큰 키값 삭제후 인덱스로 돌아가기
app.get('/logout', (req, res)=>{
  res.clearCookie('token')
  res.redirect('/')
})

// /: 이 부분 작명하는거임, 가져오는 부분과 이름 일치시켜야,,
app.get('/personal/:userid', async (req, res)=>{
  const postUser = req.params.userid;
  /* 몽고디비 posts 에서 유저아이디가 postUser인것을 
  찾아서 배열로 가져오면 userid 정보를 다 담는다 */
  try {
    const db = await getDB();
    const posts = await db.collection('posts').find({ userid:postUser }).toArray();
    res.render('personal', { posts, user:req.user, postUser })
    console.log(postUser);
  } catch (e) {
    console.error(e)
  }
})

/* req.user 쿠키에 저장돼 있는 토큰을 해석한 로그인한 정보 모두 가지고있음
(app.use)에서 사용중이라 모든 요청에 적용 */
app.get('/mypage', (req,res)=>{
  res.render('mypage', { user:req.user }) //이게 바로 바인딩됨
})

/* /like/2(몽고디비자동생성아이디) 이런 식으로 들어온다
/write.post 에서 좋아요 기본값 셋팅해놓음 
로그인된 유저아이디를 저장하고 좋아요를 누른 유저아이디를 라이크멤버에 넣어야함,
사용자가 이미 좋아요를 눌렀다면 1를 감소시키고 목록에서 제외, 
안눌렀다면 +1, 목록추가 */
app.post('/like/:id', async (req, res)=>{
  const postid = parseInt(req.params.id);//post collection id
  const userid = req.user.userid //login userid
  
  try {
    /* 배열에서 userid가 있는지없는지 */
    const db = await getDB();
    const like = await db.collection('like').findOne({ post_id: postid })
    if(like.likeMember.includes(userid)){ //좋아요를 이미 누른 경우 
      await db.collection('like').updateOne({ post_id: postid }, {
        $inc: { like: -1 }, //like -1
        $pull: { likeMember: userid } //likeMember 제거
      })
    } else{ //좋아요를 처음 누르는 경우
      await db.collection('like').updateOne({ post_id: postid }, {
        $inc: { like: 1 }, //like +1
        $push: { likeMember: userid } //likeMember 추가
      })
    }
    res.redirect('/detail/' + postid) 
  } catch (e) {
    console.log(e);
  }
})

app.listen(port, ()=>{
  console.log('server!', port);
})