import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:8080/api',
});

export const fetchTeams = () => api.get('/teams');
export const createTeam = (newTeam) => api.post('/teams', newTeam);